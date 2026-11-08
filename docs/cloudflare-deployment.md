# Drive 원본 → Cloudflare Pages 배포

현재 배포 방식은 정적 사이트입니다. Google Drive는 Markdown의 원본 저장소이고, Cloudflare Pages가 방문자에게 웹사이트를 제공합니다. Google Cloud·Drive API 키·DB는 사용하지 않습니다.

```text
Drive에서 글 수정
  → Drive 데스크톱 앱이 PC에 동기화
  → npm run deploy
  → Markdown과 사이트를 dist에 빌드
  → Cloudflare Pages에 업로드
```

배포 이후 방문자의 접속은 PC나 G: 드라이브에 의존하지 않습니다. 단, 새 내용을 배포하는 명령은 Drive 동기화가 완료된 이 PC에서 실행합니다. Drive 자체의 호스팅이나 Drive 변경 즉시 자동 배포를 구현한 것은 아닙니다.

## 설치와 최초 배포

Node.js 24 이상, Google Drive 데스크톱 앱, 무료 Cloudflare 계정이 필요합니다. Wrangler CLI는 프로젝트에 버전을 고정해 설치되어 있습니다. 새 환경에서는 `npm.cmd ci`를 실행하세요.

1. Google Drive 동기화가 완료되었는지 확인합니다. 현재 원본은 `content.config.json`의 `G:\내 드라이브\BamgasiJM_Velog_MD`입니다. API 키와 공개 공유 설정은 필요하지 않습니다.
2. 배포 파일을 생성하고 로컬에서 확인합니다.

```powershell
npm.cmd run build
npm.cmd run preview
```

`http://localhost:3001`에 접속합니다. `preview`는 **dist만 제공하며 Drive와 로컬 글 API를 사용하지 않습니다.** 3001번이 사용 중이면 `$env:PORT = '3002'`를 지정합니다. 종료는 Ctrl+C입니다.

3. 아래 명령으로 Cloudflare에 로그인합니다. 브라우저가 열리면 계정을 선택하고 Wrangler 권한을 허용합니다. 인증 토큰은 Wrangler가 관리하며 프로젝트 파일이나 채팅에 입력하지 않습니다.

```powershell
npm.cmd run cf:login
```

4. 최초 한 번 Pages Direct Upload 프로젝트를 생성합니다.

```powershell
npm.cmd run cf:create
```

기본 프로젝트 이름은 `bamgasijm`, production branch 이름은 `main`입니다. 같은 이름의 프로젝트를 이미 만들었다면 생성을 건너뜁니다. 이름 충돌 시 `wrangler.jsonc`의 `name`, package.json의 `cf:create`·`deploy` 명령에 들어 있는 프로젝트 이름을 함께 변경하세요.

5. 공개할 파일을 확인한 뒤 배포합니다.

```powershell
npm.cmd run deploy
```

Drive를 다시 읽어 빌드한 뒤 Wrangler가 Cloudflare에 업로드합니다. 성공 시 터미널에 실제 접속 URL이 출력됩니다. Pages의 `*.pages.dev` 주소를 사용하므로 도메인 구매는 필요하지 않습니다. 계정 로그인·프로젝트 생성·실제 업로드는 아직 자동 실행하지 않았습니다.

## 글 갱신

Drive에서 글 수정 → PC 동기화 완료 확인 → `npm.cmd run deploy` 순서입니다. Drive 변경만으로 공개 사이트가 바뀌지는 않습니다. 사이트에 배포된 버전은 다음 배포까지 유지됩니다. 원본 파일을 삭제한 뒤 재배포하면 새 빌드에서 제외되지만 이미 다운로드된 파일이나 이전 배포까지 회수하지는 않습니다.

## 배포 범위와 초안

- 기본적으로 지정 폴더의 숨김이 아닌 `.md` 파일은 **모두 공개 배포 대상**입니다. 현재 첫 빌드는 1,082개입니다. 글 목록뿐 아니라 원문도 정적 파일로 공개됩니다.
- `.env`, 서버 코드, 설정 파일, 로컬 초안, 다른 확장자의 원본 파일을 통째로 복사하지 않습니다.
- 아래 메타데이터가 있는 글은 목록과 본문 파일 모두 생성하지 않습니다. 기본적인 frontmatter만 처리하며 일반 YAML 파서는 아닙니다.

```markdown
---
published: false
---
# 아직 공개하지 않는 글
```

`draft: true`도 제외합니다. 표시 여부를 지정하지 않은 글은 공개 대상으로 봅니다. 메타데이터는 빌드된 본문에서 제거됩니다. 로컬 개발 모드의 폴더 목록은 모든 Markdown을 보여주므로 공개 결과는 `npm run preview`에서 확인하세요.

- 파일당 Markdown은 2MB 이하로 제한합니다. 폴더 접근·읽기 실패나 빈 결과에서는 배포 명령이 빌드 단계에서 멈춥니다. 실패 시 이전 dist를 보존합니다.
- KaTeX JS·CSS·폰트도 dist에 포함합니다. 본문 폰트는 기존처럼 Google Fonts를 사용합니다.
- 현재는 Markdown과 앱 자산만 포함합니다. HTTP(S) 외부 이미지는 원래 서버에서 읽습니다. 상대 경로 이미지·Drive 이미지 자동 복사, Class PDF 연동은 아직 지원하지 않습니다.

## 편집 기능과 현재 서비스 범위

편집·프리뷰·브라우저 초안 저장을 유지합니다. `Apply preview`는 해당 브라우저 화면에만 적용하며 Drive 원본이나 배포 사이트를 변경하지 않습니다. 현재 소유자 인증은 구현되지 않았으므로 이 편집기를 서버에 쓰는 관리자 기능으로 취급하지 않습니다. 방문자가 입력해도 다른 방문자의 글은 변경되지 않습니다.

현재 결과물은 브라우저에서 본문을 렌더링하는 정적 사이트입니다. 글별 고정 URL·검색엔진용 사전 렌더링·개별 Open Graph·RSS·소유자 인증·Drive 쓰기·온라인 발행은 후속 기능입니다. Cloudflare 업로드가 가능하다는 사실을 전체 서비스 요구사항 완료로 보고하지 않습니다.

## 무료 운영과 설정

`wrangler.jsonc`에 프로젝트 이름과 배포 폴더 `dist`를 고정했습니다. Pages Direct Upload를 사용하므로 Git 저장소나 Cloudflare 서버에서 G: 폴더를 읽는 빌드 설정은 필요 없습니다. GitHub Actions 자동 배포도 현재 설정하지 않습니다.

무료 Pages 플랜을 선택하고 유료 Workers·R2·DB·도메인 구매를 추가하지 않습니다. 계정 생성과 배포 시 [Pages 제한](https://developers.cloudflare.com/pages/platform/limits/)과 [Direct Upload 안내](https://developers.cloudflare.com/pages/get-started/direct-upload/)의 현재 파일 수·크기·요청 제한을 확인하세요. 실제 계정 플랜과 할당량은 아직 검증하지 않았습니다.
