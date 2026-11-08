import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { listMarkdown, readMarkdown } from './content-library.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/markdown.js', ['markdown.js', 'text/javascript; charset=utf-8']],
  ['/highlight.js', ['highlight.js', 'text/javascript; charset=utf-8']],
  ['/library.js', ['library.js', 'text/javascript; charset=utf-8']],
  ['/scroll-sync.js', ['scroll-sync.js', 'text/javascript; charset=utf-8']],
  ['/courses.js', ['courses.js', 'text/javascript; charset=utf-8']],
  ['/course-library.js', ['course-library.js', 'text/javascript; charset=utf-8']],
  ['/introduction.md', ['introduction.md', 'text/markdown; charset=utf-8']],
]);

export function createPreviewServer({ contentDirectory, library = { list: () => listMarkdown(contentDirectory), read: value => readMarkdown(contentDirectory, value) } }) {
  return createServer(async (request, response) => {
    const send = (status, type, body) => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const icon = url.pathname === '/favicon.ico' ? 'favicon.ico' : url.pathname.match(/^\/img\/(favicon\.ico|favicon-16x16\.png|favicon-32x32\.png|apple-touch-icon\.png)$/)?.[1];
      if (icon) { send(200, icon.endsWith('.ico') ? 'image/x-icon' : 'image/png', await readFile(new URL(`../img/${icon}`, import.meta.url))); return; }
      if (url.pathname === '/api/content') { send(200, 'application/json; charset=utf-8', JSON.stringify(await library.list())); return; }
      if (url.pathname === '/api/post') { send(200, 'text/markdown; charset=utf-8', await library.read(url.searchParams.get('path'))); return; }
      const katexAsset = url.pathname.match(/^\/node_modules\/katex\/dist\/(katex\.mjs|katex\.min\.css|fonts\/KaTeX_[A-Za-z0-9_-]+\.(?:woff2?|ttf))$/)?.[1];
      if (katexAsset) {
        const extension = path.extname(katexAsset);
        const type = { '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' }[extension];
        send(200, type, await readFile(new URL(`../node_modules/katex/dist/${katexAsset}`, import.meta.url))); return;
      }
      const route = routes.get(url.pathname);
      if (!route) { send(404, 'text/plain; charset=utf-8', 'Not found'); return; }
      send(200, route[1], await readFile(new URL(`../web/${route[0]}`, import.meta.url)));
    } catch (error) {
      const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      send(status, 'application/json; charset=utf-8', JSON.stringify({ error: error.publicMessage || (status === 404 ? '파일 또는 콘텐츠 폴더를 찾을 수 없습니다.' : status < 500 ? '허용되지 않은 파일 경로입니다.' : '파일을 읽지 못했습니다.') }));
    }
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.loadEnvFile(path.join(projectRoot, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = JSON.parse(await readFile(new URL('../content.config.json', import.meta.url), 'utf8'));
  const directory = process.env.BLOG_CONTENT_DIR || config.directory;
  const contentDirectory = directory ? path.resolve(projectRoot, directory) : null;
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
  const source = process.env.BLOG_CONTENT_SOURCE || (process.env.BLOG_CONTENT_DIR ? 'local' : config.source || 'local');
  if (!['synced-drive', 'local'].includes(source)) throw new Error('BLOG_CONTENT_SOURCE must be synced-drive or local. Google Cloud API is no longer used.');
  const missingDirectory = () => { throw Object.assign(new Error('Content directory is not configured'), { status: 503, publicMessage: 'Drive 동기화 폴더 경로를 설정해주세요. .env의 BLOG_CONTENT_DIR에 파일 탐색기에서 확인한 경로를 입력한 뒤 서버를 재시작하세요.' }); };
  const library = contentDirectory ? undefined : { list: missingDirectory, read: missingDirectory };
  const server = createPreviewServer({ contentDirectory, library });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Use another port: $env:PORT = '3001'; npm.cmd run dev` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Design preview: http://localhost:${port}`);
    console.log(contentDirectory ? `Read-only Markdown directory: ${contentDirectory}` : 'Set BLOG_CONTENT_DIR to your Google Drive desktop folder. See docs/google-drive-setup.md.');
    console.log('Stop with Ctrl+C.');
  });
}
