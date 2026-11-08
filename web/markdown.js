// Shared by the reading view and editor preview. The shared Markdown
// renderer with KaTeX and code highlighting.
import { highlightCode } from './highlight.js';
import katex from '../node_modules/katex/dist/katex.mjs';
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function renderMath(source, displayMode) {
  try {
    return katex.renderToString(source, { displayMode, throwOnError: true, trust: false, maxExpand: 200, maxSize: 20, strict: 'ignore' });
  } catch {
    return `<span class="math-error" title="Invalid formula">${escapeHtml(source)}</span>`;
  }
}

function closingDollar(text, start, delimiter) {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text.startsWith(delimiter, index)) return index;
  }
  return -1;
}

function safeUrl(value, image = false) {
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    if (!image && (/^#[^\s]*$/.test(value) || /^(?:\/(?!\/)|\.\.?\/)/.test(value)) && !value.includes('\\')) return value;
    return null;
  }
}

function readLink(text, start) {
  const image = text.startsWith('![', start);
  const labelStart = start + (image ? 2 : 1);
  let index = labelStart, depth = 1;
  for (; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '[') depth++;
    if (text[index] === ']' && --depth === 0) break;
  }
  if (index === text.length || text[index + 1] !== '(') return null;
  const label = text.slice(labelStart, index);
  let cursor = index + 2;
  while (text[cursor] === ' ') cursor++;
  const destinationStart = cursor;
  let destination;
  if (text[cursor] === '<') {
    const end = text.indexOf('>', cursor + 1);
    if (end < 0) return null;
    destination = text.slice(cursor + 1, end); cursor = end + 1;
  } else {
    let parentheses = 0;
    for (; cursor < text.length; cursor++) {
      const char = text[cursor];
      if (char === '\\') { cursor++; continue; }
      if (char === '(') parentheses++;
      if (char === ')') { if (!parentheses) break; parentheses--; }
      if (/\s/.test(char) && !parentheses) break;
    }
    destination = text.slice(destinationStart, cursor).replace(/\\([()\\])/g, '$1');
  }
  while (text[cursor] === ' ') cursor++;
  let title = '';
  if (text[cursor] === '"' || text[cursor] === "'") {
    const quote = text[cursor++];
    const titleStart = cursor;
    while (cursor < text.length && text[cursor] !== quote) { if (text[cursor] === '\\') cursor++; cursor++; }
    if (cursor >= text.length) return null;
    title = text.slice(titleStart, cursor).replace(/\\(["'\\])/g, '$1'); cursor++;
    while (text[cursor] === ' ') cursor++;
  }
  if (text[cursor] !== ')') return null;
  return { image, label: label.replace(/\\([\[\]\\])/g, '$1'), destination, title, end: cursor + 1 };
}

export function inline(text, depth = 0) {
  if (depth > 24) return escapeHtml(text);
  let html = '';
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    if (rest[0] === '\\' && /^[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]$/.test(rest[1] || '')) {
      html += escapeHtml(rest[1]); index += 2; continue;
    }
    const code = rest.match(/^(`+)([\s\S]*?)\1(?!`)/);
    if (code) { html += `<code>${escapeHtml(code[2])}</code>`; index += code[0].length; continue; }
    // Only a color declaration is accepted; all other raw HTML stays escaped.
    const colored = rest.match(/^<span\s+style\s*=\s*(["'])\s*color\s*:\s*([^"';]+)\s*;?\s*\1\s*>/i);
    if (colored) {
      const color = colored[2].trim();
      const safeColor = /^(?:[a-z]+|#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/deg]+\))$/i.test(color);
      let nesting = 1, closing;
      for (const tag of rest.slice(colored[0].length).matchAll(/<span\b[^>]*>|<\/span\s*>/gi)) {
        nesting += /^<\//.test(tag[0]) ? -1 : 1;
        if (!nesting) { closing = tag; break; }
      }
      if (safeColor && closing) {
        const end = colored[0].length + closing.index;
        html += `<span style="color: ${escapeHtml(color)}">${inline(rest.slice(colored[0].length, end), depth + 1)}</span>`;
        index += end + closing[0].length; continue;
      }
    }
    if (rest[0] === '$' && rest[1] !== '$' && text[index - 1] !== '$') {
      const end = closingDollar(text, index + 1, '$');
      const math = text.slice(index + 1, end);
      if (end > index + 1 && !math.includes('\n') && !/^\s|\s$/.test(math) && text[end + 1] !== '$') {
        html += renderMath(math, false); index = end + 1; continue;
      }
    }
    if (rest.startsWith('![') || rest[0] === '[') {
      const link = readLink(text, index);
      if (link) {
        const url = safeUrl(link.destination, link.image);
        const title = link.title ? ` title="${escapeHtml(link.title)}"` : '';
        if (!url) html += escapeHtml(text.slice(index, link.end));
        else if (link.image) html += `<img src="${escapeHtml(url)}" alt="${escapeHtml(link.label)}"${title} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
        else html += `<a href="${escapeHtml(url)}"${title} rel="noopener noreferrer">${escapeHtml(link.label)}</a>`;
        index = link.end; continue;
      }
    }
    if (rest.startsWith('**')) {
      let end = 2;
      for (; end < rest.length; end++) {
        if (rest[end] === '\\') { end++; continue; }
        const span = rest.slice(end).match(/^(`+)([\s\S]*?)\1(?!`)/);
        if (span) { end += span[0].length - 1; continue; }
        if (rest.startsWith('**', end)) break;
      }
      if (end > 2 && end < rest.length) {
        html += `<strong>${inline(rest.slice(2, end), depth + 1)}</strong>`;
        index += end + 2; continue;
      }
    }
    html += text[index] === '\n' ? '<br>' : escapeHtml(text[index]); index++;
  }
  return html;
}

function splitRow(line) {
  const cells = [];
  let cell = '';
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '\\' && line[index + 1] === '|') { cell += '|'; index++; continue; }
    if (char === '\\' && index + 1 < line.length) { cell += char + line[++index]; continue; }
    if (char === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|') && cells.at(-1) === '') cells.pop();
  return cells;
}

function tableAt(lines, index) {
  if (index + 1 >= lines.length || !lines[index].text.includes('|')) return null;
  const headers = splitRow(lines[index].text);
  const delimiters = splitRow(lines[index + 1].text);
  if (!headers.length || delimiters.length !== headers.length || !delimiters.every((cell) => /^:?-+:?$/.test(cell))) return null;
  return { headers, alignments: delimiters.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') };
}

export function parseMarkdown(source, mediaSamples = [], depth = 0) {
  // Keep original offsets, including CRLF, for the editor's scroll mapping.
  const lines = Array.from(source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g), (match) => ({
    text: match[0].replace(/[\r\n]+$/, ''), start: match.index, end: match.index + match[0].length,
  })).filter((line) => line.end > line.start);
  const chunks = [];
  const fenceAt = (index) => lines[index]?.text.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/);
  const headingAt = (index) => lines[index]?.text.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  const ruleAt = (index) => /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(lines[index]?.text || '');
  const listAt = (index) => {
    if (depth > 24 || ruleAt(index)) return null;
    const match = lines[index]?.text.match(/^( *)([-+*]|\d{1,9}[.)])([ \t]+)(.*)$/);
    return match && { indent: match[1].length, width: match[1].length + match[2].length + match[3].length, ordered: /^\d/.test(match[2]), number: parseInt(match[2], 10), text: match[4] };
  };
  const mathAt = (index) => {
    const opening = lines[index].text.trim();
    if (!opening.startsWith('$$')) return null;
    const parts = [opening.slice(2)];
    for (let end = index; end < lines.length; end++) {
      if (end > index) parts.push(lines[end].text);
      const last = parts.at(-1);
      const close = closingDollar(last, 0, '$$');
      if (close >= 0) {
        if (last.slice(close + 2).trim()) return null;
        parts[parts.length - 1] = last.slice(0, close);
        return { source: parts.join('\n').trim(), end: end + 1 };
      }
    }
    return null;
  };
  const boundaryAt = (index) => fenceAt(index) || headingAt(index) || ruleAt(index) || listAt(index) || /^\s*\$\$/.test(lines[index].text) || tableAt(lines, index) || /^> ?/.test(lines[index].text) || /^::media\[([a-z-]+)\]$/.test(lines[index].text);
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].text.trim()) { index++; continue; }
    const first = index;
    const fence = fenceAt(index), heading = headingAt(index), table = tableAt(lines, index);
    const math = !fence && mathAt(index);
    let html, level, headingText;
    if (fence) {
      index++;
      const content = [];
      const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (index < lines.length && !closing.test(lines[index].text)) content.push(lines[index++].text);
      if (index < lines.length) index++;
      const language = fence[2].trim() || 'text';
      html = `<pre data-language="${escapeHtml(language)}"><button type="button" class="code-copy" aria-label="Copy code" title="Copy code"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><code>${highlightCode(content.join('\n'), language)}</code></pre>`;
    } else if (math) {
      index = math.end;
      html = `<div class="formula">${renderMath(math.source, true)}</div>`;
    } else if (heading) {
      level = heading[1].length; headingText = heading[2]; index++;
      html = `<h${level}>${inline(headingText)}</h${level}>`;
    } else if (ruleAt(index)) {
      html = '<hr>'; index++;
    } else if (table) {
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].text.trim() && lines[index].text.includes('|') && !fenceAt(index) && !headingAt(index)) rows.push(splitRow(lines[index++].text));
      const cells = (values, tag) => table.headers.map((_, column) => `<${tag}${tag === 'th' ? ' scope="col"' : ''} class="align-${table.alignments[column]}">${inline(values[column] || '')}</${tag}>`).join('');
      html = `<div class="markdown-table" role="region" aria-label="본문 표" tabindex="0"><table><thead><tr>${cells(table.headers, 'th')}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table></div>`;
    } else if (listAt(index)) {
      const firstItem = listAt(index);
      const items = [];
      while (index < lines.length) {
        const item = listAt(index);
        if (!item || item.indent !== firstItem.indent || item.ordered !== firstItem.ordered) break;
        const content = [item.text]; index++;
        while (index < lines.length) {
          const line = lines[index].text;
          if (!line.trim()) {
            let next = index + 1;
            while (next < lines.length && !lines[next].text.trim()) next++;
            const nextItem = listAt(next);
            if (next < lines.length && (lines[next].text.startsWith(' '.repeat(item.width)) || (nextItem?.indent === firstItem.indent && nextItem.ordered === firstItem.ordered))) {
              content.push(''); index++; continue;
            }
            break;
          }
          if (!line.startsWith(' '.repeat(item.width))) break;
          content.push(line.slice(item.width)); index++;
        }
        const blocks = parseMarkdown(content.join('\n'), mediaSamples, depth + 1);
        const body = blocks.map(block => block.html).join('');
        items.push(`<li>${blocks.length === 1 && body.startsWith('<p>') ? body.slice(3, -4) : body}</li>`);
      }
      const tag = firstItem.ordered ? 'ol' : 'ul';
      html = `<${tag}${firstItem.ordered && firstItem.number !== 1 ? ` start="${firstItem.number}"` : ''}>${items.join('')}</${tag}>`;
    } else if (/^> ?/.test(lines[index].text)) {
      const quote = [];
      while (index < lines.length && /^> ?/.test(lines[index].text)) quote.push(lines[index++].text.replace(/^> ?/, ''));
      html = `<blockquote>${inline(quote.join('\n'))}</blockquote>`;
    } else if (/^::media\[([a-z-]+)\]$/.test(lines[index].text)) {
      const raw = lines[index++].text;
      const media = mediaSamples.find((item) => `::media[${item.id}]` === raw);
      html = media ? `<figure class="media-placeholder"><div class="media-art">${escapeHtml(media.icon)}</div><figcaption>${escapeHtml(media.name)}</figcaption></figure>` : `<p>${inline(raw)}</p>`;
    } else {
      const paragraph = [lines[index++].text];
      while (index < lines.length && lines[index].text.trim() && !boundaryAt(index)) paragraph.push(lines[index++].text);
      html = `<p>${inline(paragraph.join('\n'))}</p>`;
    }
    const start = lines[first].start;
    const end = lines[index - 1].end - (source.slice(lines[index - 1].start, lines[index - 1].end).match(/[\r\n]+$/)?.[0].length || 0);
    chunks.push({ start, end, raw: source.slice(start, end), heading: headingText, level, html });
  }
  return chunks;
}
