import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { buildSite, publication } from '../tools/build-site.mjs';
import { createStaticServer } from '../tools/serve-site.mjs';

test('static build works without source/API, bundles KaTeX, excludes drafts and keeps filenames safe', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'bamgasi-static-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'source');
  await mkdir(path.join(source, '한글 # 폴더'), { recursive: true });
  await writeFile(path.join(source, '한글 # 폴더', '글 & 1.md'), '# 공개 글\n\n$a>0$');
  await writeFile(path.join(source, 'hidden.md'), '---\npublished: false\n---\n비공개');
  await writeFile(path.join(source, '.secret.md'), '비밀');
  await writeFile(path.join(source, '.env'), 'SECRET=hidden');
  const result = await buildSite({ workspace, contentDirectory: source });
  assert.equal(result.posts, 1);
  assert.equal(result.excluded, 1);
  const output = path.join(workspace, 'dist');
  assert.ok((await readFile(path.join(output, 'index.html'), 'utf8')).includes('data-content="static"'));
  assert.ok(!(await readFile(path.join(output, 'markdown.js'), 'utf8')).includes('../node_modules/'));
  const manifest = JSON.parse(await readFile(path.join(output, 'content', 'index.json'), 'utf8'));
  assert.equal(manifest[0].path, '한글 # 폴더/글 & 1.md');
  assert.match(manifest[0].contentUrl, /^\/content\/posts\/[a-f0-9]{64}\.md$/);
  assert.ok(!JSON.stringify(manifest).includes('hidden.md'));
  await rm(source, { recursive: true }); // Deployment cannot depend on source availability.
  const server = createStaticServer(output);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(origin + manifest[0].contentUrl)).text(), '# 공개 글\n\n$a>0$');
  for (const asset of ['/', '/app.js', '/courses.js', '/course-library.js', '/content/index.json', '/vendor/katex/katex.mjs', '/vendor/katex/katex.min.css', '/vendor/katex/fonts/KaTeX_Main-Regular.woff2']) assert.equal((await fetch(origin + asset)).status, 200, asset);
  for (const asset of ['/favicon.ico', '/img/favicon.ico', '/img/favicon-32x32.png', '/img/favicon-16x16.png', '/img/apple-touch-icon.png']) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), asset.endsWith('.ico') ? 'image/x-icon' : 'image/png');
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const asset of ['/api/content', '/.env', '/content.config.json', '/content/posts/not-here.md']) assert.equal((await fetch(origin + asset)).status, 404, asset);
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
});

test('rebuild removes deleted posts and leaves previous deployment intact after a failed build', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'bamgasi-rebuild-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'source');
  await mkdir(source);
  await writeFile(path.join(source, 'one.md'), '# One');
  await writeFile(path.join(source, 'two.md'), '# Two');
  await buildSite({ workspace, contentDirectory: source });
  await rm(path.join(source, 'two.md'));
  await buildSite({ workspace, contentDirectory: source });
  const posts = path.join(workspace, 'dist', 'content', 'posts');
  assert.equal((await readdir(posts)).length, 1);
  await writeFile(path.join(source, 'one.md'), 'x'.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(buildSite({ workspace, contentDirectory: source }), /exceeds 2MB/);
  assert.equal((await readdir(posts)).length, 1);
  await assert.rejects(buildSite({ workspace, contentDirectory: path.join(workspace, 'dist') }), /must not contain/);
  assert.ok(!(await readdir(workspace)).some(name => name.startsWith('.site-')));
});

test('publication metadata excludes explicit drafts and strips frontmatter', () => {
  assert.equal(publication('---\r\ndraft: true\r\n---\r\n# Draft').published, false);
  assert.equal(publication('---\npublished: true\n---\n# Post').source, '# Post');
  assert.equal(publication('# Ordinary Markdown').published, true);
});
