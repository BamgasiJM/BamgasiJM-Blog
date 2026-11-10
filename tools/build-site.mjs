import { cp, readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { listMarkdown, readMarkdown, readCover } from './content-library.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const assets = ['index.html', 'app.js', 'styles.css', 'markdown.js', 'highlight.js', 'library.js', 'scroll-sync.js', 'introduction.md', 'courses.js', 'course-library.js'];

// Only the generated dist directory may be replaced. Never write to the source.
async function outputPath(root) {
  const output = path.join(await realpath(root), 'dist');
  try {
    const stat = await lstat(output);
    if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(output) !== output) throw new Error('dist must be a regular directory inside the build workspace.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return output;
}

export function publication(source) {
  const header = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header) return { published: true, source };
  const hidden = /^(?:published\s*:\s*(?:false|["']false["'])|draft\s*:\s*(?:true|["']true["']))\s*(?:#.*)?$/mi.test(header[1]);
  return { published: !hidden, source: source.slice(header[0].length) };
}

export async function buildSite({ contentDirectory, workspace = projectRoot } = {}) {
  if (!contentDirectory) throw new Error('Set BLOG_CONTENT_DIR or content.config.json directory first.');
  const root = await realpath(workspace);
  const output = await outputPath(root);
  const input = await realpath(contentDirectory);
  // Prevent accidental source deletion and recursive ingestion on repeated builds.
  const relative = path.relative(output, input);
  const reverse = path.relative(input, output);
  const inside = value => !value || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
  if (inside(relative) || inside(reverse)) throw new Error('Content directory and dist must not contain one another.');
  const entries = await listMarkdown(input);
  if (!entries.length) throw new Error('No Markdown files found. Check Drive sync before building.');
  const stage = await mkdtemp(path.join(root, '.site-build-'));
  let backup;
  try {
    await mkdir(path.join(stage, 'content', 'posts'), { recursive: true });
    for (const asset of assets) await cp(path.join(projectRoot, 'web', asset), path.join(stage, asset));
    await mkdir(path.join(stage, 'img'));
    for (const icon of ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'vpa.png', 'algorithm_coding.svg']) {
      await cp(path.join(projectRoot, 'img', icon), path.join(stage, 'img', icon));
    }
    await cp(path.join(projectRoot, 'img', 'favicon.ico'), path.join(stage, 'favicon.ico'));
    const vendor = path.join(stage, 'vendor', 'katex');
    await mkdir(vendor, { recursive: true });
    for (const file of ['katex.mjs', 'katex.min.css', 'fonts']) await cp(path.join(projectRoot, 'node_modules', 'katex', 'dist', file), path.join(vendor, file), { recursive: true });
    await cp(path.join(projectRoot, 'node_modules', 'katex', 'LICENSE'), path.join(vendor, 'LICENSE'));
    const manifest = [];
    const covers = new Map();
    let excluded = 0;
    for (const entry of entries) {
      const result = publication(await readMarkdown(input, entry.path));
      if (!result.published) { excluded++; continue; }
      const filename = createHash('sha256').update(entry.id).digest('hex') + '.md';
      const bytes = Buffer.byteLength(result.source);
      if (bytes > 2 * 1024 * 1024) throw new Error(`Markdown exceeds 2MB: ${entry.path}`);
      const contentUrl = '/content/posts/' + filename;
      await writeFile(path.join(stage, contentUrl.slice(1)), result.source);
      const { coverPath, coverUrl: localCoverUrl, ...metadata } = entry;
      let coverUrl;
      if (coverPath) {
        coverUrl = covers.get(coverPath);
        if (!coverUrl) {
          const image = await readCover(input, coverPath);
          if (image.length > 25 * 1024 * 1024) throw new Error(`Title image exceeds 25MB: ${coverPath}`);
          coverUrl = '/content/covers/' + createHash('sha256').update(image).digest('hex') + '.jpg';
          await mkdir(path.join(stage, 'content', 'covers'), { recursive: true });
          await writeFile(path.join(stage, coverUrl.slice(1)), image);
          covers.set(coverPath, coverUrl);
        }
      }
      manifest.push({ ...metadata, contentUrl, ...(coverUrl ? { coverUrl } : {}) });
    }
    if (!manifest.length) throw new Error('No published Markdown files. Previous build is preserved.');
    await writeFile(path.join(stage, 'content', 'index.json'), JSON.stringify(manifest));
    let index = await readFile(path.join(stage, 'index.html'), 'utf8');
    index = index.replace('<body class="dark">', '<body class="dark" data-content="static">')
      .replace('/node_modules/katex/dist/katex.min.css', '/vendor/katex/katex.min.css')
      .replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">');
    await writeFile(path.join(stage, 'index.html'), index);
    const markdown = await readFile(path.join(stage, 'markdown.js'), 'utf8');
    await writeFile(path.join(stage, 'markdown.js'), markdown.replace('../node_modules/katex/dist/katex.mjs', './vendor/katex/katex.mjs'));
    await writeFile(path.join(stage, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=0, must-revalidate\n');
    // A real 404 prevents Pages SPA fallback from returning HTML as Markdown.
    await writeFile(path.join(stage, '404.html'), '<!doctype html><html lang="ko"><meta charset="utf-8"><title>404</title><p>페이지를 찾을 수 없습니다.</p><a href="/">BamgasiJM</a></html>');
    await writeFile(path.join(stage, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    // The completed stage replaces the previous build only after every read succeeds.
    try {
      await lstat(output);
      backup = path.join(root, '.site-previous-' + Date.now());
      await rename(output, backup);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(stage, output); }
    catch (error) { if (backup) { await rename(backup, output); backup = null; } throw error; }
    if (backup) await rm(backup, { recursive: true });
    return { output, posts: manifest.length, excluded };
  } finally {
    // stage is created by mkdtemp directly inside the verified workspace.
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.loadEnvFile(path.join(projectRoot, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = JSON.parse(await readFile(path.join(projectRoot, 'content.config.json'), 'utf8'));
  const contentDirectory = path.resolve(projectRoot, process.env.BLOG_CONTENT_DIR || config.directory);
  const result = await buildSite({ contentDirectory });
  console.log(`Built ${result.posts} posts (${result.excluded} drafts excluded): ${result.output}`);
  console.log('Review dist before running npm run deploy. All included Markdown is publicly downloadable after deployment.');
}
