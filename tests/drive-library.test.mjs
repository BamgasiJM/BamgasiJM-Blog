import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveLibrary } from '../tools/drive-library.mjs';
import { buildTree } from '../prototype/library.js';

const folderMime = 'application/vnd.google-apps.folder';
const file = (id, name, mimeType = 'text/markdown') => ({ id, name, mimeType });

test('Drive lists nested Markdown with pagination and uses stable IDs independent of paths', async () => {
  const requests = [];
  const library = createDriveLibrary({ folderId: 'root', apiKey: 'test-key', fetchImpl: async (url, options) => {
    assert.equal(options.headers['X-Goog-Api-Key'], 'test-key');
    assert.ok(!url.href.includes('test-key'));
    requests.push(url);
    if (url.searchParams.get('alt') === 'media') return new Response('# 원문\n\n$a>0$');
    if (url.searchParams.get('q').startsWith("'child'")) return Response.json({ files: [file('post', '01_수식.md'), file('pdf', '수업.pdf', 'application/pdf'), file('shortcut', 'link.md', 'application/vnd.google-apps.shortcut')] });
    if (url.searchParams.get('pageToken')) return Response.json({ files: [file('root-post', '02.md')] });
    return Response.json({ files: [file('child', '한글 폴더', folderMime), file('hidden', '.secret.md')], nextPageToken: 'next' });
  } });
  const posts = await library.list();
  assert.equal(posts.length, 2);
  const nested = posts.find(post => post.id === 'drive:post');
  assert.equal(nested.path, '한글 폴더/01_수식.md');
  assert.equal(buildTree(posts).children[0].title, '한글 폴더');
  assert.ok(!JSON.stringify(posts).includes('fileId'));
  assert.equal(await library.read('drive:post'), '# 원문\n\n$a>0$');
  const before = requests.length;
  await assert.rejects(library.read('drive:outside'), { status: 404 });
  assert.equal(requests.length, before);
  await library.list();
  assert.equal(requests.length, before);
});

test('Drive configuration and upstream errors are actionable without leaking credentials', async () => {
  const missing = createDriveLibrary({ folderId: 'root', apiKey: '' });
  await assert.rejects(missing.list(), error => error.status === 503 && error.publicMessage.includes('GOOGLE_DRIVE_API_KEY'));
  const denied = createDriveLibrary({ folderId: 'root', apiKey: 'secret-value', fetchImpl: async () => new Response('secret-value', { status: 403 }) });
  await assert.rejects(denied.list(), error => !error.publicMessage.includes('secret-value') && error.publicMessage.includes('링크 공개'));
});

test('Drive rejects oversized Markdown and expires cached membership', async () => {
  let listed = 0, reads = 0;
  const library = createDriveLibrary({ folderId: 'root', apiKey: 'test', cacheMs: 0, fetchImpl: async url => {
    if (url.searchParams.get('alt')) { reads++; return new Response('a'.repeat(2 * 1024 * 1024 + 1)); }
    listed++;
    return Response.json({ files: listed <= 2 ? [file('large', 'large.md')] : [] });
  } });
  await library.list();
  await assert.rejects(library.read('drive:large'), { status: 413 });
  assert.equal(reads, 1);
  await assert.rejects(library.read('drive:large'), { status: 404 });
  assert.equal(reads, 1);
});
