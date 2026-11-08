import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { listMarkdown, readMarkdown, readCover } from '../tools/content-library.mjs';
import { createPreviewServer } from '../tools/preview-server.mjs';
import { buildTree, filterTree } from '../web/library.js';

test('folder covers inherit, override, reject ambiguous images and serve safely', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'bamgasi-covers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '하위', 'deeper'), { recursive: true });
  await writeFile(path.join(root, 'root.jpg'), 'root-image');
  await writeFile(path.join(root, 'one.md'), '# One');
  await writeFile(path.join(root, '하위', 'two.md'), '# Two');
  await writeFile(path.join(root, '하위', 'custom.JPEG'), 'child-image');
  await writeFile(path.join(root, '하위', 'deeper', 'three.md'), '# Three');
  const files = await listMarkdown(root);
  assert.equal(files.find(post => post.id === 'one.md').coverPath, 'root.jpg');
  const nested = files.find(post => post.id.endsWith('three.md'));
  assert.equal(nested.coverPath, '하위/custom.JPEG');
  assert.equal((await readCover(root, nested.coverPath)).toString(), 'child-image');
  for (const invalid of ['../outside.jpg', 'one.md', '.hidden.jpg', '하위/../root.jpg']) await assert.rejects(readCover(root, invalid));
  const server = createPreviewServer({ contentDirectory: root });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}` + nested.coverUrl);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(await response.text(), 'child-image');
  await writeFile(path.join(root, 'second.jpg'), 'ambiguous');
  await assert.rejects(listMarkdown(root), /Multiple title images.*root/);
});

test('content API discovers Unicode folders and reads only Markdown inside the configured root', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bamgasi-content-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'content');
  await mkdir(path.join(root, '한글 폴더', 'Chapter 2'), { recursive: true });
  await mkdir(path.join(root, '.private'));
  await writeFile(path.join(root, '.private', 'hidden.md'), 'private');
  await writeFile(path.join(root, '한글 폴더', 'Chapter 2', '02_글 #1 & 2.MD'), '# 원문\n\n본문');
  await writeFile(path.join(root, 'file10.md'), '# Ten');
  await writeFile(path.join(root, 'file2.md'), '# Two');
  await writeFile(path.join(root, 'secret.txt'), 'secret');
  await writeFile(path.join(directory, 'outside.md'), 'outside');
  const files = await listMarkdown(root);
  assert.equal(files.length, 3);
  assert.ok(files.findIndex(file => file.id === 'file2.md') < files.findIndex(file => file.id === 'file10.md'));
  const nested = files.find(file => file.id.includes('한글 폴더'));
  assert.equal(await readMarkdown(root, nested.path), '# 원문\n\n본문');
  for (const value of ['../outside.md', '/outside.md', '..\\outside.md', 'secret.txt', '.private/hidden.md', '한글 폴더/../file2.md', '']) await assert.rejects(readMarkdown(root, value));

  const server = createPreviewServer({ contentDirectory: root });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const listed = await (await fetch(origin + '/api/content')).json();
  assert.equal(listed.length, 3);
  assert.equal(await (await fetch(origin + '/api/post?path=' + encodeURIComponent(nested.path))).text(), '# 원문\n\n본문');
  for (const file of ['highlight.js', 'library.js', 'scroll-sync.js', 'introduction.md', 'courses.js', 'course-library.js']) assert.equal((await fetch(origin + '/' + file)).status, 200);
  for (const asset of ['/favicon.ico', '/img/favicon.ico', '/img/favicon-32x32.png', '/img/favicon-16x16.png', '/img/apple-touch-icon.png']) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), asset.endsWith('.ico') ? 'image/x-icon' : 'image/png');
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const [asset, mime] of [['katex.mjs', 'text/javascript'], ['katex.min.css', 'text/css'], ['fonts/KaTeX_Main-Regular.woff2', 'font/woff2']]) {
    const response = await fetch(origin + '/node_modules/katex/dist/' + asset);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(mime));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await fetch(origin + '/node_modules/katex/package.json')).status, 404);
  assert.equal((await fetch(origin + '/api/post?path=..%2Foutside.md')).status, 400);
  assert.equal((await fetch(origin + '/api/post?path=missing.md')).status, 404);
  assert.equal((await fetch(origin + '/AGENTS.md')).status, 404);
  assert.equal((await fetch(origin + '/api/content', { method: 'POST' })).status, 405);
});

test('content reading rejects symbolic links that escape the source directory', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bamgasi-link-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'content');
  await mkdir(root);
  await writeFile(path.join(directory, 'outside.md'), 'private');
  try { await symlink(path.join(directory, 'outside.md'), path.join(root, 'link.md')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Creating symbolic links is not permitted on this system.'); return; } throw error; }
  assert.deepEqual(await listMarkdown(root), []);
  await assert.rejects(readMarkdown(root, 'link.md'), { status: 403 });
});

test('tree search retains ancestors, matches folders, and handles hundreds of entries', () => {
  const posts = Array.from({ length: 600 }, (_, index) => ({ id: `시리즈/Part ${Math.floor(index / 20)}/글 ${index}.md`, title: `글 ${index}` }));
  const tree = buildTree(posts);
  assert.equal(tree.children[0].children.length, 30);
  const filtered = filterTree(tree, '글 599');
  assert.equal(filtered.children[0].children.length, 1);
  assert.equal(filtered.children[0].children[0].posts[0].id, posts[599].id);
  assert.equal(filterTree(tree, 'PART 29').children[0].children[0].posts.length, 20);
  assert.equal(filterTree(tree, 'nothing').children.length, 0);
  assert.equal(tree.children[0].children.length, 30);
});
