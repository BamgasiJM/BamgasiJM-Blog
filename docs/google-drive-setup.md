# Google Drive 폴더를 읽기 전용으로 연결하기

Google Cloud·API 키·결제 계정 없이 Google Drive 데스크톱 앱이 연결한 폴더를 읽습니다.

현재 연결 경로: **G:\내 드라이브\BamgasiJM_Velog_MD**

원본 Drive 폴더: https://drive.google.com/drive/folders/1ktO3dL4IPhFDwCgM9Owy3-hNxsuKkm2k

## 실행

1. Google Drive 데스크톱 앱을 실행하고 내 계정으로 로그인합니다.
2. 파일 탐색기에서 위 경로가 열리는지 확인합니다. 안정적인 읽기를 위해 폴더를 우클릭해 오프라인 사용 가능 설정을 권장합니다.
3. 기존 서버를 Ctrl+C로 종료하고 프로젝트에서 아래 명령을 실행합니다.

```powershell
npm.cmd run dev
```

출력된 주소를 브라우저에서 열고 Ctrl+F5로 새로고침합니다. Drive 동기화가 끝난 후 페이지를 새로고침하면 추가·수정한 Markdown이 반영됩니다. 목록 캐시는 사용하지 않습니다.

## 공유 권한

이 방식은 PC에 로그인한 Drive 계정의 접근 권한으로 파일을 읽습니다. **일반 액세스를 공개로 바꿀 필요가 없습니다. 제한됨으로 유지해도 됩니다.** 다른 사람이 소유한 폴더라면 내 계정에 뷰어 권한과 원문 다운로드 권한이 필요합니다. Google Cloud 프로젝트·서비스 계정·API 키·결제 계정은 필요하지 않습니다.

## 읽기 전용과 편집

서버는 지정한 폴더의 하위 .md 파일을 나열하고 본문을 읽기만 합니다. 업로드·수정·삭제 API가 없습니다. 브라우저 편집 기능은 유지하며 초안 저장은 localStorage, 발행은 현재 탭의 읽기 화면에만 적용됩니다. Drive 원본은 변경하지 않습니다.

로컬 폴더 방식의 초안 식별자는 상대 경로입니다. 파일명·폴더를 바꾸면 기존 초안과 다른 글로 인식합니다. 변경 전 필요한 초안은 따로 복사하세요. 기존 Drive API 방식의 파일 ID 초안은 자동 이전하지 않습니다.

이미지의 상대 경로나 Drive 공유 링크를 자동으로 변환하는 기능, Google Docs 변환, Class PDF 연결은 아직 없습니다. 기존 HTTP(S) 이미지·수식·코드·표는 유지합니다.

## 폴더 변경

content.config.json의 source는 synced-drive이며 directory에 실제 경로를 지정합니다. JSON에서는 역슬래시를 두 번 쓰거나 슬래시를 사용하세요. 환경변수로도 덮어쓸 수 있습니다.

```powershell
$env:BLOG_CONTENT_DIR = 'G:\내 드라이브\BamgasiJM_Velog_MD'
npm.cmd run dev
```

기존 .env나 터미널에 BLOG_CONTENT_DIR가 있으면 설정 파일보다 우선합니다. 예전 BLOG_CONTENT_SOURCE=drive 설정은 삭제하세요. API 모드는 현재 실행 경로에서 사용하지 않습니다.

## 실제 배포 시의 범위

이 연결은 **위 G: 드라이브가 있는 PC에서만 동작**합니다. Cloudflare Pages나 Vercel 같은 호스팅 서버는 내 PC의 G: 드라이브에 접근할 수 없습니다. API 없이 공개 배포하려면 동기화된 Markdown을 배포 저장소나 빌드 입력에 복사해 배포해야 합니다. `npm run build`가 배포 파일을 생성하고 `npm run deploy`가 Cloudflare Pages에 업로드하도록 구현했습니다. [배포 안내](cloudflare-deployment.md)를 참고하세요. 현재 로컬 연결을 실시간 원격 Drive 연동으로 안내하지 않습니다.
