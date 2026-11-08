import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export async function listMarkdown(directory) {
  const root = await realpath(directory);
  const files = [];
  async function visit(folder, parent = '', inheritedCover) {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => collator.compare(a.name, b.name));
    const images = entries.filter(entry => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith('.') && /\.jpe?g$/i.test(entry.name));
    if (images.length > 1) throw new Error(`Multiple title images in ${parent || '(root)'}: ${images.map(entry => entry.name).join(', ')}. Keep one JPG/JPEG per folder.`);
    const coverPath = images.length ? (parent ? `${parent}/` : '') + images[0].name : inheritedCover;
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const relative = parent ? `${parent}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), relative, coverPath);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push({ id: relative, title: entry.name.replace(/\.md$/i, ''), path: relative, ...(coverPath ? { coverPath, coverUrl: '/api/cover?path=' + encodeURIComponent(coverPath) } : {}) });
    }
  }
  await visit(root);
  return files;
}

export async function readMarkdown(directory, relative) {
  return readContent(directory, relative, /\.md$/i, 'utf8');
}

export async function readCover(directory, relative) {
  return readContent(directory, relative, /\.jpe?g$/i);
}

async function readContent(directory, relative, extension, encoding) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || !extension.test(relative)) {
    throw Object.assign(new Error('Invalid Markdown path'), { status: 400 });
  }
  const root = await realpath(directory);
  const target = await realpath(path.resolve(root, relative));
  const within = path.relative(root, target);
  if (!within || within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within) || !extension.test(target)) throw Object.assign(new Error('Outside content directory'), { status: 403 });
  return readFile(target, encoding);
}
