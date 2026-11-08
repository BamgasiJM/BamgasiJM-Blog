const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const supported = new Set(['js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx', 'python', 'py', 'glsl', 'hlsl', 'osl', 'c', 'cpp', 'c++', 'csharp', 'cs', 'java', 'rust', 'rs', 'json', 'css', 'sql', 'bash', 'sh', 'wgsl']);
const keywords = new Set(('as async await break case catch class const continue def default del do elif else enum except export extends false False finally fn for from function if impl import in interface is let match mod mut namespace new None null of pass private public raise return self static struct super switch this throw trait true True try type typeof uniform use using var varying vec2 vec3 vec4 float int bool void double char unsigned virtual while with yield None').split(' '));
const types = new Set('str string list dict tuple set Array Object Number String Boolean Promise Vector Vector2 Vector3 Color mat2 mat3 mat4 sampler2D i32 u32 f32 f64 usize size_t'.split(' '));

function highlightMarkup(source) {
  const token = (kind, text) => `<span class="token ${kind}">${escape(text)}</span>`;
  const tags = /<!--[\s\S]*?(?:-->|$)|<!DOCTYPE[^>]*(?:>|$)|<\/?[A-Za-z](?:[^"'<>]|"[^"]*"|'[^']*')*(?:>|$)/gi;
  let html = '', cursor = 0;
  for (const match of source.matchAll(tags)) {
    html += escape(source.slice(cursor, match.index));
    const text = match[0];
    if (text.startsWith('<!--')) html += token('comment', text);
    else if (/^<!doctype/i.test(text)) html += token('keyword', text);
    else {
      const opening = text.match(/^(<\/?)([A-Za-z][\w:.-]*)/);
      html += token('punctuation', opening[1]) + token('tag', opening[2]);
      const rest = text.slice(opening[0].length);
      let position = 0;
      for (const part of rest.matchAll(/"[^"]*"|'[^']*'|[A-Za-z_:][\w:.-]*|\/?>|=/g)) {
        html += escape(rest.slice(position, part.index));
        html += token(/^["']/.test(part[0]) ? 'string' : /^[A-Za-z_:]/.test(part[0]) ? 'attribute' : 'punctuation', part[0]);
        position = part.index + part[0].length;
      }
      html += escape(rest.slice(position));
    }
    cursor = match.index + text.length;
  }
  return html + escape(source.slice(cursor));
}

export function highlightCode(source, language = 'text') {
  const lang = language.trim().split(/\s/)[0].toLowerCase();
  if (['html', 'htm', 'xml', 'svg'].includes(lang)) return highlightMarkup(source);
  if (!supported.has(lang)) return escape(source);
  const python = ['py', 'python', 'bash', 'sh'].includes(lang);
  const tokens = /("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|#[^\n]*|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUfF]?\b|[A-Za-z_$][\w$]*)/g;
  let html = '', cursor = 0;
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    html += escape(source.slice(cursor, match.index));
    let kind;
    if (/^["'`]/.test(token)) kind = 'string';
    else if (token.startsWith('//') || token.startsWith('/*') || (python && token.startsWith('#'))) kind = 'comment';
    else if (token.startsWith('#')) kind = 'keyword';
    else if (/^\d/.test(token)) kind = 'number';
    else if (keywords.has(token)) kind = 'keyword';
    else if (types.has(token)) kind = 'type';
    else if (/^\s*\(/.test(source.slice(match.index + token.length))) kind = 'function';
    else kind = 'variable';
    html += `<span class="token ${kind}">${escape(token)}</span>`;
    cursor = match.index + token.length;
  }
  return html + escape(source.slice(cursor));
}
