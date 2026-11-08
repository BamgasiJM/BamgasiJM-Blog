// Read-only access to a public Drive folder. Credentials stay on the server.
const folderMime = 'application/vnd.google-apps.folder';
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const fail = (message, status = 502) => Object.assign(new Error(message), { status, publicMessage: message });

export function createDriveLibrary({ folderId, apiKey, fetchImpl = fetch, cacheMs = 60_000 }) {
  let snapshot = null, expires = 0, pending;
  async function request(file, params = {}) {
    if (!apiKey) throw fail('Drive 연결 설정이 필요합니다. .env에 GOOGLE_DRIVE_API_KEY를 설정하고 서버를 재시작하세요.', 503);
    if (!/^[A-Za-z0-9_-]+$/.test(folderId || '')) throw fail('Drive 폴더 ID 설정을 확인해주세요.', 503);
    const url = new URL('https://www.googleapis.com/drive/v3/files' + file);
    url.search = new URLSearchParams(params).toString();
    let response;
    try {
      response = await fetchImpl(url, { headers: { 'X-Goog-Api-Key': apiKey }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch { throw fail('Google Drive에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
    if (!response.ok) {
      if (response.status === 429) throw fail('Google Drive 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.', 503);
      throw fail('Drive 파일을 읽지 못했습니다. 폴더·파일의 링크 공개, 다운로드 허용, API 키와 Drive API 활성화를 확인해주세요.');
    }
    return response;
  }
  async function scan() {
    const files = [], visited = new Set();
    let requests = 0;
    async function visit(id, parent = '', depth = 0) {
      if (visited.has(id)) return;
      if (depth > 20) throw fail('Drive 폴더 깊이가 지원 범위(20단계)를 초과했습니다.');
      visited.add(id);
      const entries = [];
      let pageToken;
      const pages = new Set();
      do {
        if (++requests > 1000) throw fail('Drive 목록 크기가 지원 범위를 초과했습니다.');
        const params = { q: `'${id}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,size)', pageSize: '1000' };
        if (pageToken) params.pageToken = pageToken;
        const page = await (await request('', params)).json();
        if (!Array.isArray(page.files)) throw fail('Drive 목록 응답을 읽지 못했습니다.');
        entries.push(...page.files);
        pageToken = page.nextPageToken;
        if (pageToken && pages.has(pageToken)) throw fail('Drive 목록 페이지를 읽지 못했습니다.');
        pages.add(pageToken);
      } while (pageToken);
      entries.sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
      for (const entry of entries) {
        if (!/^[A-Za-z0-9_-]+$/.test(entry.id) || !entry.name || entry.name.startsWith('.') || /[/\\\0]/.test(entry.name)) continue;
        const relative = parent ? `${parent}/${entry.name}` : entry.name;
        if (entry.mimeType === folderMime) await visit(entry.id, relative, depth + 1);
        else if (/\.md$/i.test(entry.name) && !entry.mimeType.startsWith('application/vnd.google-apps.')) {
          files.push({ id: `drive:${entry.id}`, fileId: entry.id, title: entry.name.replace(/\.md$/i, ''), path: relative, size: Number(entry.size || 0) });
        }
      }
    }
    await visit(folderId);
    return files;
  }
  async function entries() {
    if (snapshot && Date.now() < expires) return snapshot;
    if (!pending) pending = scan().then(files => { snapshot = files; expires = Date.now() + cacheMs; return files; }).finally(() => { pending = null; });
    return pending;
  }
  return {
    async list() { return (await entries()).map(({ fileId, size, ...post }) => post); },
    async read(id) {
      // Never fetch arbitrary file IDs supplied by the browser.
      const file = (await entries()).find(entry => entry.id === id);
      if (!file) throw fail('지정한 Drive 폴더에서 글을 찾지 못했습니다.', 404);
      const limit = 2 * 1024 * 1024;
      if (file.size > limit) throw fail('Markdown 파일은 2MB 이하여야 합니다.', 413);
      const response = await request('/' + file.fileId, { alt: 'media' });
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > limit) { await reader.cancel(); throw fail('Markdown 파일은 2MB 이하여야 합니다.', 413); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}
