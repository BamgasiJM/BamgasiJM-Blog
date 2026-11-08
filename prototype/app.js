/* Local design prototype. Authentication, Drive, database and full Markdown rendering are future work. */
import { escapeHtml, parseMarkdown } from './markdown.js';
import { buildTree, filterTree } from './library.js';
import { createEditorScrollSync } from './scroll-sync.js';

const $ = (selector) => document.querySelector(selector);
const storageKey = 'gyeol-design-preview-v1';
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
const initialIntroduction = '# BamgasiJM\n\n크리에이티브 코딩 탐구하는 디자이너';
let posts = [{ id: introId, title: 'Introduction', draft: initialIntroduction, published: initialIntroduction, loaded: true }];
const courses = [
  ['photoshop', '명화로 배우는 포토샵', '색과 레이어로 다시 보는 명화', '명화 한 작품을 골라 색의 관계와 구도를 관찰합니다. Photoshop에서 레이어와 마스크를 사용해 나만의 이미지로 재구성합니다.', '원본과 편집본을 비교할 수 있는 이미지, 레이어를 보존한 PSD 파일'],
  ['motion-graphics', '디지털 크리에이터를 위한 모션그래픽', '움직임의 리듬과 키프레임', '도형과 타이포그래피에 키프레임을 설정합니다. 속도 곡선을 조절하며 같은 움직임이 주는 인상의 차이를 살펴봅니다.', '5초 길이의 모션 스터디와 작업 파일'],
  ['ai-artwork', 'AI로 빚는 나만의 아트워크', '아이디어에서 비주얼 콘셉트까지', '하나의 주제를 정하고 색감, 질감, 구도를 언어로 표현합니다. 생성 결과를 비교하고 선택한 이미지를 편집해 개인의 시각 언어를 찾아봅니다.', '콘셉트 보드와 프롬프트 실험 기록'],
  ['digital-animation', '디지털 애니메이션', '타이밍과 간격으로 표현하는 무게', '공이 튀는 짧은 애니메이션을 만듭니다. 프레임 사이의 간격과 타이밍을 바꾸어 무게와 탄성을 표현합니다.', '바운싱 볼 애니메이션과 주요 포즈 스케치'],
  ['ai-3d-animation', 'AI활용 3D 애니메이션', '3D 장면의 구성과 움직임 설계', 'Blender에서 기본 오브젝트, 카메라, 조명을 배치합니다. AI로 모은 시각 자료를 참고해 짧은 장면의 동작과 분위기를 설계합니다.', '장면 스틸 이미지와 간단한 카메라 애니메이션'],
];
posts.push(...courses.map(([key, course, topic, description, assignment]) => {
  const source = '# 1주차 · ' + topic + '\n\n' + course + '\n\n## 수업 내용\n\n' + description + '\n\n## 실습 과제\n\n' + assignment + '\n\n## 주차별 자료\n\n수업에서 사용한 예제와 실습 노트를 정리합니다.';
  return { id: '@class/' + key + '/week-01', section: 'class', course, courseId: key, title: '1주차 · ' + topic, draft: source, published: source, loaded: true };
}));
const blogPosts = () => posts.filter(post => post.id !== introId && post.section !== 'class');
let selected = introId;
let selectionVersion = 0;
let query = '';
let savedDrafts = {};
const layoutStorageKey = 'bamgasijm-panel-widths-v1';
let panelWidths = { sidebar: 288, outline: 216 };
let mode = 'read';
let outlineHidden = false;
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
  for (const post of posts) if (typeof savedDrafts[post.id] === 'string') post.draft = savedDrafts[post.id];
  if (saved?.codeColors === false) document.body.classList.add('code-monochrome');
  document.body.classList.toggle('dark', saved?.theme !== 'light');
} catch { storageAvailable = false; }
try {
  const savedLayout = JSON.parse(localStorage.getItem(layoutStorageKey) || 'null');
  outlineHidden = savedLayout?.outlineHidden === true;
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
    posts.filter(post => post.loaded && !post.ephemeral).forEach(post => { savedDrafts[post.id] = post.draft; });
    localStorage.setItem(storageKey, JSON.stringify({ drafts: savedDrafts, theme: document.body.classList.contains('dark') ? 'dark' : 'light', codeColors: !document.body.classList.contains('code-monochrome') }));
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
function renderClasses() {
  const open = new Set(Array.from($('#class-tree').querySelectorAll('details[open]'), node => node.dataset.course));
  $('#class-tree').innerHTML = courses.map(([key, title]) => '<details class="course-folder" data-course="' + key + '"' + (open.has(key) ? ' open' : '') + '><summary title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</summary><div class="folder-children">' + posts.filter(post => post.courseId === key).map(postButton).join('') + '</div></details>').join('');
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
async function initializeContent() {
  const introductionTask = requestText('/introduction.md').then(source => {
    const post = posts.find(post => post.id === introId);
    post.published = source; post.draft = typeof savedDrafts[introId] === 'string' ? savedDrafts[introId] : source;
    if (selected === introId) { renderArticle(); if (mode === 'edit') { $('#source').value = post.draft; renderPreview(); } }
  }).catch(() => toast('소개 파일을 읽지 못했습니다. 서버를 다시 실행해주세요.'));
  await Promise.allSettled([introductionTask, loadLibrary()]);
}
function renderArticle() {
  const post = current();
  const source = post.published;
  $('#article').classList.toggle('introduction-page', selected === introId);
  if (!source) {
    $('#article').innerHTML = `<h1>${escapeHtml(post.title)}</h1><button class="button" id="edit-empty">초안 편집</button>`;
    $('#edit-empty').addEventListener('click', () => setMode('edit'));
    $('#outline').innerHTML = '';
    return;
  }
  const articleBlocks = parse(source);
  const title = articleBlocks.find((block) => block.level === 1)?.heading || post.title;
  $('#article').innerHTML = `<h1>${escapeHtml(title)}</h1><div class="prose">${articleBlocks.map((block, index) => block.level === 1 ? '' : `<div id="read-${index}">${block.html}</div>`).join('')}</div>`;
  $('#outline').innerHTML = articleBlocks.map((block, index) => block.level >= 2 && block.level <= 3 ? `<button data-anchor="read-${index}">${escapeHtml(block.heading)}</button>` : '').join('');
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
  mode = nextMode;
  $('#reading-layout').hidden = mode !== 'read';
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
async function selectPost(id) {
  const next = posts.find(post => post.id === id);
  if (!next) return;
  const version = ++selectionVersion;
  if (mode === 'edit') { current().draft = $('#source').value; if (persist()) dirty = false; }
  clearTimeout(renderTimer);
  $('#article').setAttribute('aria-busy', 'true');
  try {
    if (!next.loaded) {
      const source = await requestText(staticContent ? next.contentUrl : '/api/post?' + (next.id.startsWith('drive:') ? 'id=' + encodeURIComponent(next.id) : 'path=' + encodeURIComponent(next.path)));
      next.published = source;
      next.draft = typeof savedDrafts[next.id] === 'string' ? savedDrafts[next.id] : source;
      next.loaded = true;
    }
    if (version !== selectionVersion) return;
    selected = id;
    const parts = (next.path || id).split('/');
    for (let index = 1; index < parts.length; index++) collapsed.delete(parts.slice(0, index).join('/'));
    renderTree(); renderArticle();
    setMode(mode, false);
    $('#save-status').textContent = '';
    $('#article-scroll').scrollTop = 0;
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
  $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
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
$('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('dark'); updateThemeLabel(); persist(); });
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
  $('#sidebar').inert = false;
  $('#sidebar').classList.add('open'); $('#scrim').hidden = false;
  $('#sidebar-toggle').setAttribute('aria-expanded', 'true');
  $('.main').inert = true;
  $('#close-sidebar').focus();
});
$('#close-sidebar').addEventListener('click', closeSidebar); $('#scrim').addEventListener('click', closeSidebar);
document.addEventListener('keydown', (event) => {
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
  const otherWidth = key === 'sidebar' ? (width > 1000 && mode === 'read' && !outlineHidden ? panelWidths.outline + 6 : 0) : panelWidths.sidebar + 6;
  const min = key === 'sidebar' ? 220 : 160;
  const max = Math.max(min, Math.min(key === 'sidebar' ? 560 : 420, width - otherWidth - 366));
  return { min, max };
}
function updateOutline() {
  $('#reading-layout').classList.toggle('outline-hidden', outlineHidden);
  const toggle = $('#outline-toggle');
  toggle.hidden = mode === 'edit';
  toggle.setAttribute('aria-expanded', String(!outlineHidden));
  toggle.setAttribute('aria-pressed', String(!outlineHidden));
  const label = outlineHidden ? 'Show table of contents' : 'Hide table of contents';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
}
$('#outline-toggle').addEventListener('click', () => {
  outlineHidden = !outlineHidden;
  updateOutline();
  applyPanelWidths();
  savePanelWidths();
});
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
  try { localStorage.setItem(layoutStorageKey, JSON.stringify({ ...panelWidths, outlineHidden, sections: sectionCollapsed })); } catch { /* Keep widths for the current session. */ }
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
  applyPanelWidths();
  if (!window.matchMedia('(max-width: 760px)').matches || !$('#sidebar').classList.contains('open')) closeSidebar();
  if (mode === 'edit') requestAnimationFrame(renderPreview);
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
renderTree(); renderArticle(); updateThemeLabel(); updateCodeLabel(); updateOutline(); updateSections();
applyPanelWidths();
initializeContent();
closeSidebar();
if (!storageAvailable) toast('브라우저 저장 공간을 사용할 수 없어 새로고침하면 변경 사항이 사라질 수 있습니다.');
