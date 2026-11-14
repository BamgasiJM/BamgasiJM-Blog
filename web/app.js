/* Static blog UI shared by local development and Cloudflare Pages. */
import { escapeHtml, parseMarkdown } from './markdown.js';
import { buildTree, filterTree, adjacentPosts } from './library.js';
import { createEditorScrollSync } from './scroll-sync.js';
import { courses } from './courses.js';
import { coursePosts } from './course-library.js';

const $ = (selector) => document.querySelector(selector);
document.addEventListener('click', async event => {
  const button = event.target.closest('.code-copy');
  if (!button) return;
  const code = button.closest('pre')?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent);
    button.classList.add('copied');
    button.setAttribute('aria-label', 'Copied');
    button.title = 'Copied';
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => {
      button.classList.remove('copied');
      button.setAttribute('aria-label', 'Copy code');
      button.title = 'Copy code';
    }, 1600);
  } catch { toast('코드를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해주세요.'); }
});
const storageKey = 'gyeol-design-preview-v1';
const themePresets = {
  dark: [['default', 'Graphite'], ['charcoal', 'Catppuccin Mocha'], ['black', 'Gruvbox Dark'], ['night-owl', 'Night Owl'], ['monokai', 'Monokai'], ['deep-dark-space', 'Deep Dark Space']],
  light: [['default', 'White'], ['paper', 'Catppuccin Latte'], ['silver', 'Gruvbox Light'], ['newsprint', 'Newsprint']],
};
const themeChoices = { dark: 'default', light: 'default' };
const staticContent = document.body.dataset.content === 'static';
if (staticContent) {
  $('#publish').textContent = 'Apply preview';
  $('#publish').title = '이 브라우저에서만 적용합니다. 공개 사이트와 Drive 원본은 변경하지 않습니다.';
}
const mediaSamples = [
  { id: 'sample-jpg', type: 'JPG', name: 'geometry-study.jpg', detail: '이미지 · 블로그로 복사', icon: '◇' },
  { id: 'sample-png', type: 'PNG', name: 'coordinate-system.png', detail: '이미지 · 블로그로 복사', icon: '↗' },
  { id: 'sample-gif', type: 'GIF', name: 'rotation-loop.gif', detail: '애니메이션 · 블로그로 복사', icon: '↻' },
  { id: 'sample-mp4', type: 'MP4', name: 'form-finding.mp4', detail: '동영상 · Drive 미리보기', icon: '▷' },
  { id: 'sample-pdf', type: 'PDF', name: 'rhino-python-notes.pdf', detail: '문서 · Drive 미리보기', icon: '▤' },
];
const introId = '@introduction';
let posts = [{ id: introId, title: 'Introduction', draft: '', published: null, loaded: true }];
posts.push(...coursePosts(courses));
const blogPosts = () => posts.filter(post => post.id !== introId && post.section !== 'class');
let selected = introId;
let selectionVersion = 0;
let query = '';
let savedDrafts = {};
let savedDraftBases = {};
const layoutStorageKey = 'bamgasijm-panel-widths-v1';
let panelWidths = { sidebar: 288, outline: 216 };
let mode = 'read';
let outlineHidden = false;
let compactOutlineOpen = false;
let sidebarHidden = false;
const sectionCollapsed = { blog: false, class: false };
let dirty = false;
let storageAvailable = true;
let toastTimer;
let renderTimer;
let blocks = [];
const collapsed = new Set();
const current = () => posts.find((post) => post.id === selected);
const editorScroll = createEditorScrollSync({
  source: $('#source'),
  preview: $('#editor-preview'),
  getPositions: getScrollPositions,
  enabled: () => mode === 'edit' && $('#sync-toggle').checked && $('#source').clientWidth > 0 && $('#editor-preview').clientWidth > 0,
});
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved?.drafts) savedDrafts = saved.drafts;
  if (saved?.draftBases) savedDraftBases = saved.draftBases;
  for (const post of posts) if (post.id !== introId && post.kind !== 'pdf' && typeof savedDrafts[post.id] === 'string') post.draft = savedDrafts[post.id];
  if (saved?.codeColors === false) document.body.classList.add('code-monochrome');
  document.body.classList.toggle('dark', saved?.theme !== 'light');
  for (const mode of ['dark', 'light']) {
    if (themePresets[mode].some(([id]) => id === saved?.themeChoices?.[mode])) themeChoices[mode] = saved.themeChoices[mode];
  }
} catch { storageAvailable = false; }
try {
  const savedLayout = JSON.parse(localStorage.getItem(layoutStorageKey) || 'null');
  outlineHidden = savedLayout?.outlineHidden === true;
  sidebarHidden = savedLayout?.sidebarHidden === true;
  for (const key of ['blog', 'class']) sectionCollapsed[key] = savedLayout?.sections?.[key] === true;
  for (const key of ['sidebar', 'outline']) {
    if (Number.isFinite(savedLayout?.[key])) panelWidths[key] = savedLayout[key];
  }
} catch { /* Panel sizing also works without browser storage. */ }
function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4300);
}
function persist() {
  try {
    posts.filter(post => post.loaded && post.published !== null && !post.ephemeral && post.kind !== 'pdf').forEach(post => {
      savedDrafts[post.id] = post.draft;
      if (post.id === introId) savedDraftBases[introId] = introductionSource;
    });
    localStorage.setItem(storageKey, JSON.stringify({ drafts: savedDrafts, draftBases: savedDraftBases, theme: document.body.classList.contains('dark') ? 'dark' : 'light', themeChoices, codeColors: !document.body.classList.contains('code-monochrome') }));
    storageAvailable = true;
    return true;
  } catch { storageAvailable = false; toast('브라우저 저장 공간에 접근할 수 없습니다. 작성 내용을 따로 복사해주세요.'); return false; }
}
function parse(source) {
  return parseMarkdown(source, mediaSamples);
}
function rendered(chunks, prefix) {
  return chunks.map((block, index) => `<div data-block="${index}" id="${prefix}-${index}">${block.html}</div>`).join('');
}
function postButton(post) {
  return `<button class="tree-post ${post.id === selected ? 'selected' : ''}" data-post="${escapeHtml(post.id)}" title="${escapeHtml(post.title)}" ${post.id === selected ? 'aria-current="page"' : ''}><span class="title">${escapeHtml(post.title)}</span>${post.loaded && post.published === null ? '<span class="draft-dot" title="초안" aria-label="초안"></span>' : ''}</button>`;
}
function folderHtml(folder) {
  const isCollapsed = !query && collapsed.has(folder.id);
  return `<div class="folder"><button class="folder-toggle" data-folder="${escapeHtml(folder.id)}" aria-expanded="${!isCollapsed}" title="${escapeHtml(folder.title)}"><span class="folder-title">${escapeHtml(folder.title)}</span></button><div class="folder-children" ${isCollapsed ? 'hidden' : ''}>${isCollapsed ? '' : folder.children.map(folderHtml).join('') + folder.posts.map(postButton).join('')}</div></div>`;
}
function allFoldersExpanded() {
  const tree = buildTree(blogPosts());
  const expanded = folder => folder.children.every(child => !collapsed.has(child.id) && expanded(child));
  return Boolean(query) || expanded(tree);
}
function renderClasses(reset = false) {
  const open = new Set(reset ? [] : Array.from($('#class-tree').querySelectorAll('details[open]'), node => node.dataset.course));
  $('#class-tree').innerHTML = courses.map(({ id: key, title }) => '<details class="course-folder" data-course="' + key + '"' + (open.has(key) ? ' open' : '') + '><summary title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</summary><div class="folder-children">' + posts.filter(post => post.courseId === key).map(postButton).join('') + '</div></details>').join('');
}
function renderTree() {
  renderClasses();
  const expanded = allFoldersExpanded();
  const toggle = $('#toggle-folders');
  const label = expanded ? 'Collapse all folders' : 'Expand all folders';
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-pressed', String(expanded));
  toggle.disabled = !buildTree(blogPosts()).children.length;
  $('#folder-toggle-path').setAttribute('d', expanded ? 'M8 5l4 4 4-4M8 19l4-4 4 4' : 'M8 9l4-4 4 4M8 15l4 4 4-4');
  const tree = filterTree(buildTree(blogPosts()), query);
  $('#introduction-link').classList.toggle('selected', selected === introId);
  $('#introduction-link').setAttribute('aria-current', selected === introId ? 'page' : 'false');
  $('#tree').innerHTML = tree.children.map(folderHtml).join('') + tree.posts.map(postButton).join('');
  if (query && !tree.children.length && !tree.posts.length) $('#tree').innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
}
function setAllFolders(open) {
  if (open) collapsed.clear();
  else {
    // Search automatically expands matching ancestors; leave search to make
    // the requested fully collapsed state visible immediately.
    query = ''; $('#tree-search').value = '';
    const visit = folder => folder.children.forEach(child => { collapsed.add(child.id); visit(child); });
    visit(buildTree(blogPosts()));
  }
  renderTree();
  $('#tree').scrollTop = 0;
}
async function requestText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || '콘텐츠를 불러오지 못했습니다. 서버와 폴더 설정을 확인해주세요.');
  }
  return response.text();
}
async function loadLibrary() {
  $('#library-status').textContent = '불러오는 중…';
  $('#retry-library').hidden = true;
  try {
    const entries = JSON.parse(await requestText(staticContent ? '/content/index.json' : '/api/content'));
    posts = [...posts.filter(post => post.id === introId || post.section === 'class'), ...entries.map(entry => ({ ...entry, draft: null, published: null, loaded: false }))];
    const collapseAll = folder => { folder.children.forEach(child => { collapsed.add(child.id); collapseAll(child); }); };
    collapseAll(buildTree(blogPosts()));
    $('#library-status').textContent = entries.length ? '' : 'Markdown 파일이 없습니다.';
    renderTree();
  } catch (error) {
    $('#library-status').textContent = error.message;
    $('#retry-library').hidden = false;
  }
}
let introductionSource = null;
async function initializeContent() {
  const introductionTask = requestText('/introduction.md').then(source => {
    const post = posts.find(post => post.id === introId);
    introductionSource = source;
    post.published = source;
    post.draft = savedDraftBases[introId] === source && typeof savedDrafts[introId] === 'string' ? savedDrafts[introId] : source;
    if (selected === introId) { renderArticle(); if (mode === 'edit') { $('#source').value = post.draft; renderPreview(); } }
  }).catch(() => toast('소개 파일을 읽지 못했습니다. 서버를 다시 실행해주세요.'));
  await Promise.allSettled([introductionTask, loadLibrary()]);
}
// Query URLs work on static hosting without per-post rewrite rules.
function postFromLocation() {
  return new URL(location.href).searchParams.get('post') || introId;
}
function recordPost(id, replace = false) {
  const url = new URL(location.href);
  if (id === introId) url.searchParams.delete('post');
  else url.searchParams.set('post', id);
  url.hash = '';
  if (replace) history.replaceState({ post: id }, '', url);
  else if (url.href !== location.href) history.pushState({ post: id }, '', url);
}
async function restorePostFromLocation() {
  const id = postFromLocation();
  if (!posts.some(post => post.id === id)) {
    toast('요청한 글을 찾을 수 없습니다. 글 목록과 주소를 확인해주세요.');
    return;
  }
  await selectPost(id, { record: false });
}
function renderArticle() {
  const post = current();
  const pdf = post.kind === 'pdf';
  $('#pdf-layout').hidden = !pdf;
  const frame = $('#course-pdf');
  if (pdf) {
    $('#reading-layout').hidden = true;
    $('#article').replaceChildren();
    $('#outline').replaceChildren();
    frame.title = post.course + ' · ' + post.title + ' PDF';
    frame.hidden = !post.pdfUrl;
    $('#pdf-error').hidden = Boolean(post.pdfUrl);
    if (post.pdfUrl && (frame.dataset.post !== post.id || frame.getAttribute('src') !== post.pdfUrl)) { frame.src = post.pdfUrl; frame.dataset.post = post.id; }
    else if (!post.pdfUrl) frame.removeAttribute('src');
    return;
  }
  frame.removeAttribute('src');
  const source = post.published;
  $('#article').classList.toggle('introduction-page', selected === introId);
  if (selected === introId && source === null) {
    $('#article').replaceChildren();
    $('#outline').replaceChildren();
    return;
  }
  if (!source) {
    $('#article').innerHTML = `<h1>${escapeHtml(post.title)}</h1><button class="button" id="edit-empty">초안 편집</button>`;
    $('#edit-empty').addEventListener('click', () => setMode('edit'));
    $('#outline').innerHTML = '';
    renderPostNavigation(post);
    return;
  }
  const articleBlocks = parse(source);
  const title = articleBlocks.find((block) => block.level === 1)?.heading || post.title;
  $('#article').innerHTML = `<h1>${escapeHtml(title)}</h1><div class="prose">${articleBlocks.map((block, index) => block.level === 1 ? '' : `<div id="read-${index}">${block.html}</div>`).join('')}</div>`;
  $('#outline').innerHTML = articleBlocks.map((block, index) => block.level >= 2 && block.level <= 3 ? `<button data-anchor="read-${index}">${escapeHtml(block.heading)}</button>` : '').join('');
  if (post.coverUrl && selected !== introId && post.section !== 'class') {
    const cover = document.createElement('img');
    cover.className = 'article-cover';
    cover.alt = '';
    cover.src = post.coverUrl;
    cover.addEventListener('error', () => cover.remove(), { once: true });
    $('#article').prepend(cover);
  }
  renderPostNavigation(post);
}
function renderPostNavigation(post) {
  if (post.id === introId || post.section === 'class' || post.ephemeral) return;
  const { previous, next } = adjacentPosts(blogPosts().filter(item => !item.ephemeral), post.id);
  const nav = document.createElement('nav');
  nav.className = 'post-navigation';
  nav.setAttribute('aria-label', '이전 글과 다음 글');
  for (const [direction, target] of [['previous', previous], ['next', next]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `post-navigation-button ${direction}`;
    const label = direction === 'previous' ? 'Previous post' : 'Next post';
    button.setAttribute('aria-label', target ? `${label}: ${target.title}` : label);
    button.title = target ? `${label}: ${target.title}` : label;
    button.disabled = !target;
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${direction === 'previous' ? 'M17 4 5 12l12 8Z' : 'm7 4 12 8-12 8Z'}"/></svg>`;
    if (target) button.addEventListener('click', () => selectPost(target.id));
    nav.append(button);
  }
  $('#article').append(nav);
}
function renderPreview() {
  editorScroll.updatePreview(() => {
    blocks = parse($('#source').value);
    $('#editor-preview').innerHTML = rendered(blocks, 'preview');
    const mirror = $('#source-mirror');
    mirror.style.width = `${$('#source').clientWidth}px`;
    const source = $('#source').value;
    let cursor = 0;
    mirror.replaceChildren();
    blocks.forEach((block, index) => {
      mirror.append(document.createTextNode(source.slice(cursor, block.start)));
      const span = document.createElement('span');
      span.dataset.sourceBlock = index;
      span.textContent = source.slice(block.start, block.end);
      mirror.append(span); cursor = block.end;
    });
    mirror.append(document.createTextNode(source.slice(cursor) + '\n'));
  });
}
function setMode(nextMode, stash = true) {
  if (mode === 'edit' && stash) { current().draft = $('#source').value; clearTimeout(renderTimer); }
  const pdf = current().kind === 'pdf';
  mode = pdf ? 'read' : nextMode;
  $('#mode-toggle').hidden = pdf;
  $('#pdf-layout').hidden = !pdf;
  $('#reading-layout').hidden = pdf || mode !== 'read';
  $('#editor-layout').hidden = mode !== 'edit';
  const modeLabel = mode === 'edit' ? 'Switch to read mode' : 'Switch to edit mode';
  $('#mode-toggle').setAttribute('aria-label', modeLabel);
  $('#mode-toggle').title = modeLabel;
  $('#mode-toggle').setAttribute('aria-pressed', String(mode === 'edit'));
  $('#new-note').hidden = mode !== 'edit';
  updateOutline();
  applyPanelWidths();
  if (mode === 'edit') {
    $('#source').value = current().draft;
    requestAnimationFrame(renderPreview);
  } else renderArticle();
}
async function selectPost(id, { record = true } = {}) {
  const next = posts.find(post => post.id === id);
  if (!next) return;
  const version = ++selectionVersion;
  if (mode === 'edit') { current().draft = $('#source').value; if (persist()) dirty = false; }
  clearTimeout(renderTimer);
  $('#article').setAttribute('aria-busy', 'true');
  try {
    if (!next.loaded) {
      const source = await requestText(staticContent ? next.contentUrl : '/api/post?path=' + encodeURIComponent(next.path));
      next.published = source;
      next.draft = typeof savedDrafts[next.id] === 'string' ? savedDrafts[next.id] : source;
      next.loaded = true;
    }
    if (version !== selectionVersion) return;
    selected = id;
    if (record && !next.ephemeral) recordPost(id);
    document.title = id === introId ? 'BamgasiJM BLOG' : `${next.title} · BamgasiJM BLOG`;
    compactOutlineOpen = false;
    const parts = (next.path || id).split('/');
    for (let index = 1; index < parts.length; index++) collapsed.delete(parts.slice(0, index).join('/'));
    renderTree(); renderArticle();
    setMode(mode, false);
    $('#save-status').textContent = '';
    $('#article-scroll').scrollTop = 0;
    if (mode === 'read' && next.kind !== 'pdf' && window.matchMedia('(max-width: 760px)').matches) window.scrollTo(0, 0);
    closeSidebar();
  } catch (error) { if (version === selectionVersion) toast(error.message); }
  finally { if (version === selectionVersion) $('#article').setAttribute('aria-busy', 'false'); }
}
async function showIntroduction(event) {
  event?.preventDefault();
  await selectPost(introId);
  setMode('read');
}
function closeSidebar() {
  const wasOpen = $('#sidebar').classList.contains('open');
  $('#sidebar').classList.remove('open'); $('#scrim').hidden = true;
  $('.main').inert = false;
  $('#sidebar').inert = window.matchMedia('(max-width: 760px)').matches;
  updateSidebarToggle();
  if (wasOpen && window.matchMedia('(max-width: 760px)').matches) $('#sidebar-toggle').focus();
}
function insertText(text) {
  const source = $('#source');
  source.setRangeText(text, source.selectionStart, source.selectionEnd, 'end');
  source.dispatchEvent(new Event('input')); source.focus();
}
function getScrollPositions() {
  const preview = $('#editor-preview'), mirror = $('#source-mirror');
  const sourcePositions = Array.from(mirror.querySelectorAll('[data-source-block]'), (span) => span.getBoundingClientRect().top - mirror.getBoundingClientRect().top);
  const previewPositions = Array.from(preview.querySelectorAll('[data-block]'), (element) => element.getBoundingClientRect().top - preview.getBoundingClientRect().top + preview.scrollTop);
  return { source: sourcePositions, preview: previewPositions };
}
$('#tree').addEventListener('click', (event) => {
  const folder = event.target.closest('[data-folder]');
  if (folder) { collapsed.has(folder.dataset.folder) ? collapsed.delete(folder.dataset.folder) : collapsed.add(folder.dataset.folder); renderTree(); }
  const post = event.target.closest('[data-post]'); if (post) selectPost(post.dataset.post);
});
$('.brand').addEventListener('click', showIntroduction);
$('#introduction-link').addEventListener('click', showIntroduction);
$('#tree-search').addEventListener('input', event => { query = event.target.value.trim(); renderTree(); });
$('#toggle-folders').addEventListener('click', () => setAllFolders(!allFoldersExpanded()));
$('#class-tree').addEventListener('click', event => { const post = event.target.closest('[data-post]'); if (post) selectPost(post.dataset.post); });
$('#retry-library').addEventListener('click', loadLibrary);
$('#mode-toggle').addEventListener('click', () => setMode(mode === 'read' ? 'edit' : 'read'));
$('#outline').addEventListener('click', (event) => { const anchor = event.target.closest('[data-anchor]'); if (anchor) document.getElementById(anchor.dataset.anchor)?.scrollIntoView({ block: 'start' }); });
$('#source').addEventListener('input', () => {
  dirty = true; current().draft = $('#source').value;
  $('#save-status').textContent = '저장 전';
  clearTimeout(renderTimer); renderTimer = setTimeout(renderPreview, 160);
});
$('#save-draft').addEventListener('click', () => {
  current().draft = $('#source').value;
  if (current().ephemeral) { toast('새 글은 화면 체험용입니다. 새로고침 전 원문을 복사해 보관해주세요.'); return; }
  if (persist()) { dirty = false; $('#save-status').textContent = '저장됨'; }
});
$('#publish').addEventListener('click', () => {
  const post = current(); post.draft = $('#source').value; post.published = post.draft;
  post.title = parse(post.draft).find((block) => block.level === 1)?.heading || post.title;
  dirty = false; $('#save-status').textContent = ''; renderTree(); setMode('read');
});
document.querySelectorAll('[data-insert]').forEach((button) => button.addEventListener('click', () => insertText(({ heading: '\n\n## 새로운 소제목\n\n', bold: '**강조할 내용**', code: '\n\n```python\nprint("Hello, geometry")\n```\n\n', math: '\n\n$$\nx^2 + y^2 = r^2\n$$\n\n' })[button.dataset.insert])));
$('#new-note').addEventListener('click', () => {
  if (mode === 'edit') current().draft = $('#source').value;
  const id = `new-${Date.now()}`;
  posts.push({ id, loaded: true, ephemeral: true, title: '제목 없는 기록', draft: '# 제목 없는 기록\n\n## 오늘의 생각\n\n여기에서 기록을 시작하세요.', published: null });
  query = ''; $('#tree-search').value = ''; selectPost(id).then(() => setMode('edit', false));
  toast('체험용 초안을 만들었습니다. 새 글은 새로고침하면 초기화됩니다.');
});
const presetButton = document.createElement('button');
presetButton.id = 'theme-presets-toggle';
presetButton.className = 'icon-button';
presetButton.setAttribute('aria-label', 'Choose theme');
presetButton.title = 'Choose theme';
presetButton.setAttribute('popovertarget', 'theme-presets');
presetButton.setAttribute('aria-controls', 'theme-presets');
presetButton.setAttribute('aria-expanded', 'false');
presetButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/></svg>';
$('#theme-toggle').after(presetButton);
const presetPanel = document.createElement('div');
presetPanel.id = 'theme-presets';
presetPanel.setAttribute('popover', 'auto');
presetPanel.setAttribute('role', 'group');
presetPanel.setAttribute('aria-label', 'Theme presets');
document.body.append(presetPanel);
function applyThemePreset() {
  const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
  document.body.dataset.themePreset = themeChoices[mode];
  presetPanel.innerHTML = themePresets[mode].map(([id, label]) => `<button type="button" data-preset="${id}" aria-pressed="${themeChoices[mode] === id}"><span class="theme-swatch" data-mode="${mode}" data-swatch="${id}" aria-hidden="true"></span>${label}</button>`).join('');
}
presetPanel.addEventListener('toggle', event => {
  const open = event.newState === 'open';
  presetButton.setAttribute('aria-expanded', String(open));
  presetButton.setAttribute('aria-pressed', String(open));
});
presetPanel.addEventListener('click', event => {
  const option = event.target.closest('[data-preset]');
  if (!option) return;
  const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
  themeChoices[mode] = option.dataset.preset;
  applyThemePreset(); persist();
  presetPanel.hidePopover(); presetButton.focus();
});
applyThemePreset();
$('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('dark'); updateThemeLabel(); applyThemePreset(); persist(); });
$('#code-toggle').addEventListener('click', () => { document.body.classList.toggle('code-monochrome'); updateCodeLabel(); persist(); });
function updateCodeLabel() {
  const enabled = !document.body.classList.contains('code-monochrome');
  const label = enabled ? 'Code colors on' : 'Code colors off';
  $('#code-toggle').setAttribute('aria-pressed', String(enabled));
  $('#code-toggle').setAttribute('aria-label', label);
  $('#code-toggle').title = label;
  $('#code-label').textContent = label;
}
function updateThemeLabel() {
  const dark = document.body.classList.contains('dark');
  const label = dark ? 'Light mode' : 'Dark mode';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  $('#theme-toggle').setAttribute('aria-label', label);
  $('#theme-toggle').title = label;
  $('#theme-label').textContent = label;
}
$('#sidebar-toggle').addEventListener('click', () => {
  if (!window.matchMedia('(max-width: 760px)').matches) {
    sidebarHidden = !sidebarHidden;
    updateSidebarToggle();
    applyPanelWidths();
    savePanelWidths();
    return;
  }
  compactOutlineOpen = false;
  updateOutline();
  $('#sidebar').inert = false;
  $('#sidebar').classList.add('open'); $('#scrim').hidden = false;
  $('#sidebar-toggle').setAttribute('aria-expanded', 'true');
  updateSidebarToggle();
  $('.main').inert = true;
  $('#close-sidebar').focus();
});
$('#close-sidebar').addEventListener('click', closeSidebar); $('#scrim').addEventListener('click', closeSidebar);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && compactOutlineOpen) closeCompactOutline();
  if (!$('#sidebar').classList.contains('open')) return;
  if (event.key === 'Escape') closeSidebar();
  if (event.key === 'Tab') {
    const focusable = Array.from($('#sidebar').querySelectorAll('a,button,input')).filter((element) => element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
function mobileTab(preview) {
  $('#editor-panes').classList.toggle('mobile-preview', preview);
  $('#tab-edit').setAttribute('aria-pressed', String(!preview)); $('#tab-preview').setAttribute('aria-pressed', String(preview));
  requestAnimationFrame(renderPreview);
}
$('#tab-edit').addEventListener('click', () => mobileTab(false)); $('#tab-preview').addEventListener('click', () => mobileTab(true));
$('#media-grid').innerHTML = mediaSamples.map((media) => `<button class="media-card" data-media="${media.id}"><div class="media-art">${media.icon}</div><strong>${media.name}</strong><small>${media.type}</small></button>`).join('');
$('#open-media').addEventListener('click', () => $('#media-dialog').showModal());
$('#close-media').addEventListener('click', () => $('#media-dialog').close());
$('#media-grid').addEventListener('click', (event) => { const card = event.target.closest('[data-media]'); if (!card) return; $('#media-dialog').close(); insertText(`\n\n::media[${card.dataset.media}]\n\n`); });
let resizing = false;
const resizer = $('#pane-resizer'), panes = $('#editor-panes');
function setWidth(value) { const percent = Math.max(30, Math.min(70, value)); panes.style.setProperty('--editor-width', `${percent}%`); resizer.setAttribute('aria-valuenow', String(Math.round(percent))); if (mode === 'edit') renderPreview(); }
resizer.addEventListener('pointerdown', (event) => { resizing = true; resizer.setPointerCapture(event.pointerId); });
resizer.addEventListener('pointermove', (event) => { if (resizing) { const rect = panes.getBoundingClientRect(); setWidth((event.clientX - rect.left) / rect.width * 100); } });
resizer.addEventListener('pointerup', () => { resizing = false; });
resizer.addEventListener('pointercancel', () => { resizing = false; });
resizer.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setWidth(Number(resizer.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -5 : 5)); } });

function panelBounds(key) {
  const width = $('.workspace').clientWidth;
  const otherWidth = key === 'sidebar' ? (width > 1000 && mode === 'read' && current().kind !== 'pdf' && !outlineHidden ? panelWidths.outline + 6 : 0) : sidebarHidden ? 0 : panelWidths.sidebar + 6;
  const min = key === 'sidebar' ? 220 : 160;
  const max = Math.max(min, Math.min(key === 'sidebar' ? 560 : 420, width - otherWidth - 366));
  return { min, max };
}
function updateOutline() {
  const compact = window.matchMedia('(max-width: 1000px)').matches;
  const visible = compact ? compactOutlineOpen : !outlineHidden;
  $('#reading-layout').classList.toggle('compact-outline-open', compact && compactOutlineOpen);
  $('#reading-layout').classList.toggle('outline-hidden', outlineHidden);
  const toggle = $('#outline-toggle');
  toggle.hidden = mode === 'edit' || current().kind === 'pdf';
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.setAttribute('aria-pressed', String(visible));
  const label = visible ? 'Hide table of contents' : 'Show table of contents';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
}
$('#outline-toggle').addEventListener('click', () => {
  if (window.matchMedia('(max-width: 1000px)').matches) compactOutlineOpen = !compactOutlineOpen;
  else outlineHidden = !outlineHidden;
  updateOutline();
  applyPanelWidths();
  savePanelWidths();
});
function closeCompactOutline() {
  compactOutlineOpen = false;
  updateOutline();
  $('#outline-toggle').focus();
}
$('#close-outline').addEventListener('click', closeCompactOutline);
$('#outline').addEventListener('click', event => {
  if (event.target.closest('[data-anchor]') && compactOutlineOpen) closeCompactOutline();
});
function updateSidebarToggle() {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const visible = mobile ? $('#sidebar').classList.contains('open') : !sidebarHidden;
  $('.workspace').classList.toggle('sidebar-hidden', sidebarHidden);
  $('#sidebar').inert = !visible;
  const button = $('#sidebar-toggle');
  button.setAttribute('aria-expanded', String(visible));
  button.setAttribute('aria-controls', 'sidebar');
  button.setAttribute('aria-label', visible ? 'Hide navigation' : 'Show navigation');
  button.title = visible ? 'Hide navigation' : 'Show navigation';
}
function refreshEditorGeometry() {
  if (mode === 'edit') $('#source-mirror').style.width = `${$('#source').clientWidth}px`;
}
function applyPanelWidths() {
  if ($('.workspace').clientWidth <= 760) return;
  for (const key of ['sidebar', 'outline']) {
    const { min, max } = panelBounds(key);
    panelWidths[key] = Math.round(Math.max(min, Math.min(max, panelWidths[key])));
    $('.workspace').style.setProperty(`--${key}-width`, `${panelWidths[key]}px`);
    const handle = $(`#${key}-resizer`);
    handle.setAttribute('aria-valuemin', String(min));
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(panelWidths[key]));
    handle.setAttribute('aria-valuetext', `${panelWidths[key]} 픽셀`);
  }
  refreshEditorGeometry();
}
function savePanelWidths() {
  try { localStorage.setItem(layoutStorageKey, JSON.stringify({ ...panelWidths, sidebarHidden, outlineHidden, sections: sectionCollapsed })); } catch { /* Keep widths for the current session. */ }
}
function updateSections() {
  for (const key of ['blog', 'class']) {
    const closed = sectionCollapsed[key];
    $(`.${key}-section`).classList.toggle('section-collapsed', closed);
    $(`#${key}-section-body`).hidden = closed;
    const button = $(`#${key}-section-toggle`);
    button.setAttribute('aria-expanded', String(!closed));
    const label = `${closed ? 'Expand' : 'Collapse'} ${key === 'blog' ? 'Generative Art blog' : 'Class materials'}`;
    button.title = label;
    button.setAttribute('aria-label', label);
  }
}
for (const key of ['blog', 'class']) {
  $(`#${key}-section-toggle`).addEventListener('click', () => {
    sectionCollapsed[key] = !sectionCollapsed[key];
    updateSections();
    savePanelWidths();
  });
}
function bindPanelResize(key, direction) {
  const handle = $(`#${key}-resizer`);
  let drag = null;
  const update = width => {
    const { min, max } = panelBounds(key);
    panelWidths[key] = Math.max(min, Math.min(max, width));
    applyPanelWidths();
  };
  const finish = () => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing-panels');
    savePanelWidths();
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, width: panelWidths[key] };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing-panels');
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) update(drag.width + direction * (event.clientX - drag.x));
  });
  handle.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    finish();
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  });
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('keydown', event => {
    const { min, max } = panelBounds(key);
    const step = event.shiftKey ? 40 : 16;
    const change = { ArrowLeft: -step * direction, ArrowRight: step * direction }[event.key];
    if (change === undefined && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    update(event.key === 'Home' ? min : event.key === 'End' ? max : panelWidths[key] + change);
    savePanelWidths();
  });
  handle.addEventListener('dblclick', () => { update(key === 'sidebar' ? 288 : 216); savePanelWidths(); });
}
bindPanelResize('sidebar', 1);
bindPanelResize('outline', -1);
document.fonts?.ready.then(refreshEditorGeometry);
document.fonts?.addEventListener('loadingdone', refreshEditorGeometry);
window.addEventListener('resize', () => {
  updateSidebarToggle();
  updateOutline();
  applyPanelWidths();
  if (!window.matchMedia('(max-width: 760px)').matches || !$('#sidebar').classList.contains('open')) closeSidebar();
  if (mode === 'edit') requestAnimationFrame(renderPreview);
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
renderClasses(true);
renderTree(); renderArticle(); updateThemeLabel(); updateCodeLabel(); updateOutline(); updateSections();
applyPanelWidths();
const contentReady = initializeContent();
contentReady.then(async () => {
  history.replaceState({ post: postFromLocation() }, '', location.href);
  await restorePostFromLocation();
});
window.addEventListener('popstate', async () => {
  // Invalidate an in-flight selection immediately, even during initial loading.
  selectionVersion++;
  await contentReady;
  await restorePostFromLocation();
});
closeSidebar();
if (!storageAvailable) toast('브라우저 저장 공간을 사용할 수 없어 새로고침하면 변경 사항이 사라질 수 있습니다.');
