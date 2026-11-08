# Class 수업자료 PDF 설정

설정 파일은 **`web/courses.js`**입니다. 다섯 과목마다 `weeks`에 1~15주차 항목을 따로 두었습니다. 현재 75개 항목 모두 요청한 동일 PDF를 가리킵니다.

예를 들어 명화로 배우는 포토샵의 2주차를 바꾸려면 `id: "photoshop"` 과목의 `week: 2`에서 `url`만 수정합니다.

```js
{ week: 2, url: "https://drive.google.com/file/d/새로운_파일_ID/view?usp=sharing" },
```

일반 Drive 공유 주소 `/file/d/파일_ID/view?usp=sharing` 또는 `/file/d/파일_ID/preview`를 그대로 넣을 수 있습니다. 앱이 검증 후 iframe용 `/preview` 주소로 변환합니다. `resourcekey`가 포함된 주소는 해당 값도 유지합니다. `week`, 과목 `id`는 유지하세요.

## 표시 방식

- 수업을 펼치고 주차를 선택하면 상단 바 아래 본문 전체를 PDF iframe이 채웁니다. 제목·Markdown 본문·오른쪽 목차는 PDF와 함께 표시하지 않습니다.
- PDF에서는 편집·목차 버튼을 숨깁니다. 블로그 글이나 Introduction으로 돌아오면 기존 Markdown 화면과 편집 기능이 복원됩니다.
- PDF 내부의 스크롤·페이지 이동·확대·축소는 Google Drive 기본 뷰어를 사용합니다. 앱의 에디터 스크롤 동기화와 연결하지 않습니다.
- 다른 주차를 선택하면 같은 PDF 주소라도 해당 주차의 뷰어를 새로 엽니다.
- 임의 HTML이나 외부 iframe 주소를 허용하지 않고, 검증된 HTTPS `drive.google.com/file/d/.../preview`만 생성합니다.

## 공유와 확인

PDF는 **공유 → 일반 액세스 → 링크가 있는 모든 사용자 → 뷰어**로 설정합니다. 로그인한 소유자만 열리는 파일은 방문자에게 보이지 않습니다. Drive 앱의 Markdown 동기화와 달리 PDF는 방문자의 브라우저가 Google에서 직접 읽으므로 인터넷과 공개 공유 권한이 필요합니다. Google Cloud API 키는 필요하지 않습니다.

Drive의 네트워크·브라우저 정책·권한 오류는 Google iframe 안에서 표시됩니다. 다른 출처의 iframe 내부 상태를 앱에서 직접 읽을 수 없으므로 iframe load 이벤트를 PDF 렌더링 성공으로 표시하지 않습니다. 새 주소를 넣은 뒤 로그아웃한 시크릿 창에서도 확인하세요.

## 실행 및 배포

`npm.cmd run dev`로 확인할 때는 서버를 재시작해야 새 `courses.js` 모듈 경로가 등록됩니다. 브라우저도 Ctrl+F5로 새로고침하세요.

배포 프리뷰는 `npm.cmd run build` 후 `npm.cmd run preview`로 확인합니다. 공개 사이트에는 `npm.cmd run deploy`로 반영합니다. PDF 파일 자체는 dist에 복사하지 않고 주소 설정만 배포합니다. 따라서 같은 Drive 파일 ID의 내용을 교체하면 Google 측 캐시·미리보기 처리 후 반영될 수 있으며, 다른 파일 ID로 바꾸려면 courses.js를 수정해 재배포해야 합니다.

개발 서버와 정적 배포 모두 courses.js와 course-library.js를 제공하도록 구성했습니다. 현재 공유 PDF의 preview 응답과 헤드리스 Chrome에서 실제 PDF 표시, 75개 주차 항목, 전체 본문 영역 크기, 다른 주차 선택, Markdown 읽기·편집 복귀를 확인했습니다.
