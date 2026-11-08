import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export async function listMarkdown(directory) {
  const root = await realpath(directory);
  const files = [];
  async function visit(folder, parent = '') {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => collator.compare(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const relative = parent ? `${parent}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), relative);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push({ id: relative, title: entry.name.replace(/\.md$/i, ''), path: relative });
    }
  }
  await visit(root);
  return files;
}

export async function readMarkdown(directory, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || !/\.md$/i.test(relative)) {
    throw Object.assign(new Error('Invalid Markdown path'), { status: 400 });
  }
  const root = await realpath(directory);
  const target = await realpath(path.resolve(root, relative));
  const within = path.relative(root, target);
  if (!within || within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within) || !/\.md$/i.test(target)) throw Object.assign(new Error('Outside content directory'), { status: 403 });
  return readFile(target, 'utf8');
}
