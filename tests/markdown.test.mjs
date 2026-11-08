import test from 'node:test';
import assert from 'node:assert/strict';
import { inline, parseMarkdown } from '../web/markdown.js';
import { highlightCode } from '../web/highlight.js';

const imageUrl = 'https://velog.velcdn.com/images/ryoong1125/post/4d7d749d-b56f-4893-9efc-6e244842b064/image.jpg';
const render = (source) => parseMarkdown(source).map((block) => block.html).join('');

test('bold text supports inline code and preserves code delimiters safely', () => {
  assert.equal(inline('**`word`**'), '<strong><code>word</code></strong>');
  assert.equal(inline('**앞 `a**b` 뒤**'), '<strong>앞 <code>a**b</code> 뒤</strong>');
  assert.equal(inline('`**literal**`'), '<code>**literal**</code>');
  assert.equal(inline('**<script>alert(1)</script>**'), '<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
  assert.equal(inline('**`<div>`**'), '<strong><code>&lt;div&gt;</code></strong>');
  assert.ok(inline('**중요 $a>0$**').includes('class="katex"'));
  assert.equal(inline('**unclosed'), '**unclosed');
});

test('bulleted and ordered lists render nested content without consuming surrounding blocks', () => {
  const source = '도입\r\n- **첫 항목**\r\n- `둘째`\r\n  - 하위 항목\r\n  - 다음 하위\r\n\r\n## 다음\r\n본문';
  const blocks = parseMarkdown(source);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[1].html, '<ul><li><strong>첫 항목</strong></li><li><p><code>둘째</code></p><ul><li>하위 항목</li><li>다음 하위</li></ul></li></ul>');
  assert.equal(blocks[2].heading, '다음');
  for (const block of blocks) assert.equal(source.slice(block.start, block.end), block.raw);
  assert.equal(render('3. 세 번째\n4. 네 번째'), '<ol start="3"><li>세 번째</li><li>네 번째</li></ol>');
  assert.equal(render('* 첫째\n+ 둘째'), '<ul><li>첫째</li><li>둘째</li></ul>');
  assert.equal(render('앞\n\n---\n\n- 항목'), '<p>앞</p><hr><ul><li>항목</li></ul>');
  assert.ok(!render('```text\n- 원문\n```').includes('<ul>'));
});

test('list continuations can include paragraphs and fenced code with markup highlighting', () => {
  const html = render('- 첫 문단\n\n  두 번째 문단\n\n  ```html\n  <b class="test">내용</b>\n  ```\n- 다음');
  assert.ok(html.includes('<ul><li><p>첫 문단</p><p>두 번째 문단</p><pre'));
  assert.ok(html.includes('class="token tag">b'));
  assert.ok(html.endsWith('</li><li>다음</li></ul>'));
});

test('HTML fences color tags, attributes, values and comments while keeping raw markup inert', () => {
  const source = '<!-- 설명 -->\n<div class="box" data-value=10 title="a > b">내용 & more</div>\n<script>alert(1)</script>';
  for (const language of ['html', 'HTML', 'htm', 'xml', 'svg']) {
    const html = highlightCode(source, language);
    for (const kind of ['tag', 'attribute', 'string', 'comment', 'punctuation']) assert.ok(html.includes(`class="token ${kind}"`), kind);
    assert.ok(html.includes('class="token tag">div</span>'));
    assert.ok(html.includes('class="token attribute">class</span>'));
    assert.ok(!html.includes('<div') && !html.includes('<script>'));
    assert.ok(html.includes('&amp; more'));
  }
  assert.ok(render('```html\n'+source+'\n```').includes('class="token tag"'));
  assert.ok(!render(source).includes('class="token tag"'));
});

test('the reported Velog image renders even with empty alternative text', () => {
  const html = render(`![](${imageUrl})`);
  assert.ok(html.includes(`<img src="${imageUrl}" alt=""`));
  assert.ok(!html.includes('![]('));
});

test('inline images support titles, query strings and balanced URL parentheses', () => {
  const html = inline('앞 ![이미지](https://example.com/image(1).png?a=1&b=2 "설명") 뒤');
  assert.ok(html.includes('src="https://example.com/image(1).png?a=1&amp;b=2"'));
  assert.ok(html.includes('alt="이미지" title="설명"'));
  assert.ok(html.startsWith('앞 ') && html.endsWith(' 뒤'));
});

test('image labels and titles cannot introduce HTML attributes', () => {
  const html = inline('![" onerror="alert(1)](https://example.com/image.jpg)');
  assert.ok(html.includes('alt="&quot; onerror=&quot;alert(1)"'));
  assert.ok(!html.includes('alt="" onerror='));
  assert.ok(!render('<img src=x onerror=alert(1)>').includes('<img'));
});

test('unsafe image and link protocols do not produce active elements', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'file:///secret.png', '//evil.example/image.png', 'https://owner:password@example.com/image.png']) {
    assert.ok(!inline(`![image](${url})`).includes('<img'), url);
    assert.ok(!inline(`[link](${url})`).includes('<a '), url);
  }
  assert.ok(inline('[문서](https://example.com/docs)').includes('<a href="https://example.com/docs"'));
});

test('a Markdown table renders a header, body and column alignment', () => {
  const html = render('| 항목 | 값 | 설명 |\n| :--- | ---: | :---: |\n| 반지름 | 10 | **강조** |\n| 높이 | 20 | `코드` |');
  assert.ok(html.includes('<table><thead>'));
  assert.ok(html.includes('<th scope="col" class="align-left">항목</th>'));
  assert.ok(html.includes('<td class="align-right">10</td>'));
  assert.ok(html.includes('<td class="align-center"><strong>강조</strong></td>'));
  assert.equal((html.match(/<tr>/g) || []).length, 3);
  assert.ok(!html.includes(':---'));
});

test('tables without outside pipes support empty, short and excess rows', () => {
  const html = render('항목 | 값\n--- | ---\n빈 값 |\n짧은 행\n');
  assert.ok(html.includes('<td class="align-left"></td>'));
  assert.ok(!html.includes('<td class="align-left">짧은 행</td>'));
  const more = render('A | B\n- | -\n1 | 2 | extra');
  assert.equal((more.match(/<td /g) || []).length, 2);
  assert.ok(!more.includes('extra'));
});

test('escaped pipes inside regular and code cells do not create extra columns', () => {
  const html = render('| 내용 | 코드 |\n| --- | --- |\n| 왼쪽 \\| 오른쪽 | `a \\| b` |');
  assert.equal((html.match(/<td /g) || []).length, 2);
  assert.ok(html.includes('왼쪽 | 오른쪽'));
  assert.ok(html.includes('<code>a | b</code>'));
});

test('table cells use the same image renderer and escape raw HTML', () => {
  const html = render(`| 이미지 | 설명 |\n| --- | --- |\n| ![예시](${imageUrl}) | <script>alert(1)</script> |`);
  assert.ok(html.includes(`<img src="${imageUrl}"`));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('paragraphs, tables and adjacent headings remain separate scroll blocks', () => {
  const source = '도입\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n## 다음 제목\r\n본문';
  const blocks = parseMarkdown(source);
  assert.equal(blocks.length, 4);
  assert.ok(blocks[1].html.includes('<table>'));
  assert.equal(blocks[2].heading, '다음 제목');
  for (const block of blocks) assert.equal(source.slice(block.start, block.end), block.raw);
  assert.equal(blocks[1].start, source.indexOf('| A'));
  assert.equal(blocks[2].start, source.indexOf('## 다음'));
});

test('invalid table delimiters remain ordinary text', () => {
  for (const source of ['A | B\nhello | world', '| A | B |\n| --- |\n| 1 | 2 |', '가 | 나\n---:x | ---']) {
    assert.ok(!render(source).includes('<table>'));
  }
});

test('code blocks and inline code preserve image and table source', () => {
  const source = `\`\`\`markdown\n![](${imageUrl})\n| A | B |\n| - | - |\n\`\`\``;
  const html = render(source);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<table>'));
  assert.ok(html.includes(`![](${imageUrl})`));
  assert.ok(!inline(`\`![](${imageUrl})\``).includes('<img'));
  assert.ok(inline('`**원문**`').includes('<code>**원문**</code>'));
});

test('block math and media cards render', () => {
  assert.ok(render('$$\nx^2 + y^2 = r^2\n$$').includes('class="formula"'));
  assert.ok(parseMarkdown('::media[sample-pdf]', [{ id: 'sample-pdf', name: 'notes.pdf', icon: '▤', detail: 'Drive 미리보기' }])[0].html.includes('notes.pdf'));
});

test('KaTeX renders inline and block fractions, comparisons and source offsets', () => {
  const source = String.raw`앞 $a>0$ 뒤

$$
a=\frac{\Delta y}{\Delta x}
$$

$$x^2$$
## 다음`;
  const blocks = parseMarkdown(source);
  assert.ok(blocks[0].html.includes('class="katex"'));
  assert.ok(blocks[1].html.includes('katex-display'));
  assert.ok(blocks[1].html.includes('mfrac'));
  assert.ok(blocks[2].html.includes('katex-display'));
  assert.equal(blocks[3].heading, '다음');
  for (const block of blocks) assert.equal(source.slice(block.start, block.end), block.raw);
});

test('math leaves code, escaped dollars and unmatched delimiters intact', () => {
  assert.equal(inline('`$a>0$`'), '<code>$a&gt;0$</code>');
  assert.equal(inline('\\$a>0\\$'), '$a&gt;0$');
  assert.ok(!render('```latex\n$$x^2$$\n```').includes('class="katex"'));
  const blocks = parseMarkdown('$$\nunclosed\n\n## 다음\n본문');
  assert.ok(blocks.some(block => block.heading === '다음'));
  assert.equal(inline('$unclosed'), '$unclosed');
});

test('invalid and untrusted math cannot activate HTML or stop subsequent content', () => {
  const html = render(String.raw`$\notACommand$ $\href{javascript:alert(1)}{click}$ $\htmlClass{evil}{x}$

## 다음`);
  assert.ok(html.includes('math-error'));
  assert.ok(!html.includes('<a href="javascript:'));
  assert.ok(!html.includes('class="evil"'));
  assert.ok(html.includes('<h2>다음</h2>'));
});

test('horizontal rules render between paragraphs without affecting tables or code', () => {
  for (const rule of ['---', '***', '___', '- - -']) {
    const blocks = parseMarkdown(`앞 문단\n\n${rule}\n\n뒤 문단`);
    assert.equal(blocks.length, 3);
    assert.equal(blocks[1].html, '<hr>');
  }
  assert.ok(!render('```text\n---\n```').includes('<hr>'));
  assert.ok(render('| 제목 | 값 |\n| --- | --- |\n| a | b |').includes('<table>'));
});

test('code highlighting separates keywords, variables, numbers, strings and comments safely', () => {
  const html = highlightCode('const radius = 10;\nconsole.log("<img onerror=alert(1)>"); // note', 'javascript');
  for (const kind of ['keyword', 'variable', 'number', 'string', 'comment', 'function']) assert.ok(html.includes(`class="token ${kind}"`), kind);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  const python = render('```python\ndef draw():\n    radius = 10 # note\n```');
  assert.ok(python.includes('class="token keyword">def'));
  assert.ok(python.includes('class="token variable">radius'));
  assert.equal(highlightCode('<unknown>', 'unknown-language'), '&lt;unknown&gt;');
});
