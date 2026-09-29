# extensions/src — 확장 TypeScript 소스

`extensions/src/`는 확장 런타임의 TypeScript 소스다. `extensions/scripts/build-runtime.mjs`가
esbuild로 IIFE 하나(`globalName: KidItemRuntime`)로 묶어
`extensions/kiditem-os/runtime/kiditem-runtime.js`에 쓰고, 서비스워커가 옛 JS 모듈 뒤에
싣는다. 규약: 브라우저 API는 `chrome.*`만 쓴다. `import.meta`와 번들러 전용 API(동적
`import()`, `require`, 환경 변수 치환 등)는 쓰지 않는다. `func.toString()`으로 함수 소스를
페이지에 주입하지 않는다(번들이 이름을 바꾸고 바깥 스코프를 끌어들인다).
`@kiditem/shared`는 import해도 되며 번들에 포함된다. 폴더는 4층이고 의존은 한 방향이다(KID-357, `npm run check:extension-runtime-layers`):

- `entry/` — 웹앱·팝업이 부르는 액션 표 → core. 로직 없음. 수집기가 선언한 사이트 이름으로 등록표에서 핸들을
  조립한다(`entry/site-handles.ts`, 사이트별 분기 없음). 한 번에 끝나는 entry 액션은 `entry/actions/`에 액션마다 파일
  하나다(아래). 어느 파일도 옛 전역(`KidItemDomains` 등)을 참조하지 않는다.
- `core/` — operation client(서버 실행 계약의 유일한 창구), runner(begin → 청크 → finish 순서),
  브라우저 자원(창·탭·로그인, 이름은 서버 lockKey와 같다), 사이트 호출기(간격·XSRF), 오류, 그리고 확장 입구의 바탕
  (KID-366, 아래 "입구와 인증"). core는 core만 import한다.
- `collectors/<kind>/` — 서버 kind 문자열과 같은 이름. `collect(plan, site) → 청크 스트림`.
  서버·탭·토큰을 모른다: core 중 `site-caller`·`errors`만 쓴다.
- `sites/<site>/` — 사이트 API·DOM 읽기·쓰기만. core 중 `site-caller`·`errors`만 쓴다. 사이트는 파일 끝에서
  `registerSite`(`sites/registry.ts`)로 스스로 등록하고, 입구는 이름으로 조립한다(KID-355).
  content script는 API가 없어 DOM을 읽어야 할 때만, 페이지 주입은 파일 주입만.
  인자가 필요한 페이지 읽기는 `sites/page-call.ts`(ISOLATED 브리지 → MAIN 러너 → 처리기 파일, KID-359 H3)를 쓴다.

입구와 인증(KID-366): 웹앱 메시지는 `core/dispatch.ts`가 `chrome.runtime.onMessageExternal`의 **유일한** 리스너로 받는다 —
보내는 창 origin → 환경(`core/environment.ts`, `local` = `http://localhost:3000` → API `:4000`, `office`; 표에 없는 origin은
`FORBIDDEN`) → `{action}`으로 표의 액션 → shared 스키마(`@kiditem/shared/extension-actions`) 검증(실패는 `VALIDATION_FAILED`,
details에는 칸 이름만) → 실행 → 봉투 `{success:true,…}|{success:false, errorCode, error, details?}`. 메시지가 말하는 환경은
믿지 않는다. 팝업·콘텐츠 스크립트 메시지는 내부 dispatch가 이 확장에서 온 것만 받고, 환경은 팝업이 고른 id나 팝업이 묶어 둔
Wing 탭(`kiditem_coupang_environment_tab_bindings_v1`)으로 정한다. 토큰은 `core/auth-store.ts`(옛 `environment-context.js`와
같은 `kiditem_environment_profiles_v1` 키·모양이라 과도기 옛 워커의 `authedFetch`도 읽는다)에만 있고 응답·로그로 나가지 않는다.
KidItem API는 `core/authed-fetch.ts`가 부른다(환경 API origin 안 경로만, Bearer, 25초 제한, 토큰이 없거나 401이면 그 환경 웹
탭에 재로그인 힌트 파일 `content/page-call/auth-required-event.js`를 넣고 새 토큰을 10초 기다려 한 번만 다시). 응답할 때까지
`core/keep-alive.ts`(참조 카운트, 20초 깨우기)가 서비스워커를 붙든다.

entry 액션(한 번에 끝나는 호출, 서버 사실 없음, 파일은 base64로 부른 쪽에): 토큰(`setAuthToken`·`clearAuthToken`), 몰 로그인
(`checkMallLogin` — `sites/mall-session/check.ts`, 조용한 읽기 뒤 확인용 탭, 로그인하지 않음; `testMallLogin` — 계정 화면 테스트,
자격은 메모리에만), 쿠팡 쉽먼트(`openCoupangShipmentPage` 운영자에게 넘기는 탭은 앞으로, `fetchCoupangShipmentPdfBatch` 확인용 탭은
닫는다, `clearCoupangCookies` 값은 읽지 않음), `hostPublicImages`·`listMallCategories`, 내부 `exportWingInventoryWorkbook`·
`kiditemApiRequest`. `ping`은 새 런타임 capability(`operationRuntime` + 묶음 5종)를 낸다.

과도기(wave8b·wave9까지): 새 표가 모르는 액션은 서비스워커가 `KidItemRuntime.attachLegacyActions(KidItemDomains)`로 넘긴 옛
워커 표(셀피아·송장 업로드·배송 목록·카카오·수집 세션)로 가고, `ping`은 그 표의 capability를 합친다(새 런타임이 이긴다).
옛 워커가 사라지면 이 한 줄과 `attachLegacy`도 지운다.

사이트 자동 로그인(KID-377)은 `sites/site-login.ts` 한 곳이다. 저장 자격은 웹이 `operation.start`의 `credentials`로
보내고 runner가 그 실행의 사이트 lease로만 넘긴다 — 서버·plan·progress·result·청크·로그·오류 details에 싣지 않는다.
폼 채우기는 `content/page-call/login-fill.js`에 페이지 호출 인자로 그 탭에만 가며, 옛 `executeScript` 인자와 같은
노출이다. 실패한 로그인은 `SITE_LOGIN_REQUIRED` details.reason(`credentials_rejected`·`no_credentials`·
`verification_required`·`login_unconfirmed`)으로 알리고, runner가 failed finish의 `result.login`에 까닭과 몰의 말만 싣는다.
웹이 차단 때문에 자격을 싣지 않은 실행(`operation.start`의 `loginBlocked`, `operationLoginBlockedV1`)은 `no_credentials` 대신
`blocked`로 적는다(실기기 R7). 캡차가 붙은 폼(아트공구 reCAPTCHA)은 칸만 채우고 `verification_required`로 멈춰 탭을 앞으로
가져오고, 눌렀지만 몰의 폼 검사가 막아 보내기가 나가지 않았으면(같은 문서에 폼) `login_unconfirmed`다 — 보내기가 나간 뒤 폼이
다시 온 것만 `credentials_rejected`다(재QA 3 D1).
웹(`apps/web/src/lib/operation-login.ts`)은 `credentials_rejected`면 몰의 말과 상관없이 그 몰의 자동 로그인을 멈춘다(KID-380 D10 —
같은 자격으로 거듭 두드리면 계정이 잠긴다). 푸는 것은 사람이고, 스스로 도는 수집의 한 시간 간격은 그대로다.

몰 이관 규칙(H3′·L′, KID-380·381): 로그인 폼 명세가 없는 사이트(올웨이즈 JWT, 지마켓·옥션·스마트스토어·떠리몰·11번가 목록)는
`loginSpec` 없이 `PageGuard.isLogin`만 두어 로그인 화면이면 `SITE_LOGIN_REQUIRED`로 멈추고 탭을 남긴다(운영자가 로그인).
세션이 탭에 묶인 사이트(롯데ON)는 `withFreshTab(..., { reuseTabMatching })`으로 열린 탭을 재사용한다. 엑셀·blob을 내려받는
몰(꼬망세·롯데ON·보리보리·티쳐몰·GS샵·올웨이즈)은 MAIN world 파일(`content/page-call/*`)이 blob을 잡아 base64 청크로
보내고, 개인정보 다운로드 사유·엑셀 템플릿 번호·벤더명 같은 몰 상수는 옛 값 그대로 사이트 모듈 상수다. 다운로드 암호로
계정 비밀번호를 쓰는 몰(보리보리)은 `lease.credentials.password`를 페이지 호출 인자로만 넘긴다. 이 호출은 MAIN world
처리기라 인자가 ISOLATED 브리지 → MAIN 러너로 같은 출처 `window.postMessage`를 건너므로, 그 몰 화면의 어느 스크립트든
볼 수 있다(옛 `executeScript` 인자보다 넓다 — 리더 수용, KID-380). 로그인 폼 채우기는 ISOLATED 전용(`isolatedOnly`)이라
페이지로 가지 않는다. 서버·plan·progress·result·청크·로그·오류 details에는 싣지 않는다.
SMS·본인확인 화면(GS샵)은 `waitForOperator`로 멈췄다 잇는다.

불러오는 중 알림 창 가드(KID-380 D4): 몰이 로드 중 `alert`·`confirm`을 띄우면 백그라운드 탭이 멈춘다. `withFreshTab`(로그인
입구의 `hosts` 또는 `dialogGuardHosts`)과 로그인하러 여는 탭은 주소를 옮기기 전에 `TabPages.guardDialogs`로 그 호스트에
MAIN world·document_start 등록 content script(`content/page-call/dialog-guard.js`, 실행마다 id 하나)를 걸고 끝나면 지운다.
MAIN 가드와 함께 ISOLATED 짝(`dialog-guard-bridge.js`)을 건다. 짝은 런타임에 물어(`kiditem.dialogGuard.isRunTab`, 런타임이 연
탭 목록 `TabPages.isRunTab`) 수집 탭이면 `run-tab`, 아니면 `operator-tab` 표시를 MAIN에 보낸다. 답이 오기 전과 수집 탭에서
`alert`은 문장만 `window.__kiditemDialogs`에 모으고 바로 돌아간다(알림은 안내일 뿐이고 창이 로드를 막는다 — 실행 동안만).
`confirm`은 수집 탭에서만 자동 확인하고, 답이 오기 전에는 진짜 창이다 — 짝의 답보다 먼저 로드 중에 뜬 `confirm`은 수집 탭이라도
진짜 창이 뜬다(경합). 운영자 탭은 둘 다 진짜 창이다. 런타임이 탭을 운영자에게 넘기면(`TabPage.focus` — 앞으로 가져온 GS샵 SMS
인증 탭 — 과 운영자에게 남긴 탭 `keep`) 수집 탭에서 빼고 짝에 `kiditem.dialogGuard.setRunTab`을 보내 진짜 창으로 돌리며, 이 런타임이
그 탭을 다시 옮기면 다시 수집 탭이다. 탭이 보이는지(`visibilityState`)로 가리지 않는다 — DevTools가 붙은 Chrome은 백그라운드 탭도
visible이다(실기기 R1). 서비스워커가 다시 뜨면 입구가 `sweepDialogGuards`로 남은 가드 등록을 지운다. 수집 탭과 로그인 단계는 로그인 화면에 닿으면 다
그려지기를 기다리지 않는다(`stopAt`). `chrome.scripting`은 `sites/tab-page.ts`만 만진다. 로그인 결과 알림 창(`login-dialogs.js`)은 가드가 있으면 가드가 모은 문장을 몰의 말로 쓰고, 없으면(운영자 탭) 옛 규칙대로
`alert`을 바꿨다가 되돌린다.

광고센터(`sites/ad-center`, KID-371 `advertising.ad_report`): 읽기 전용이고 허용된 쓰기는 보고서 생성(`requestReport`) 하나다.
잠금 키 `resource:ad-center:<id>`가 사이트 이름 `ad-center`의 탭(`/marketing`)을 연다 — 로그인 직후 그 화면을 한 번 열어야
`cmg-api`·`tetris-api`가 답하므로 탭을 여는 것이 곧 워밍업이고, 그래도 처음 500이 오면 탭을 다시 열고 한 번만 다시 묻는다.
호출은 서비스워커 fetch(쿠키, 리다이렉트 안 따라감)이고 GraphQL은 HTTP 200에 `errors[]`로 실패하므로 사이트가 `SITE_REQUEST_FAILED`
(`graphql_error`)로 바꾼다. 로그인 화면은 광고센터 `/user/login…`(계정 유형 선택)과 판매자 로그인(`xauth.coupang.com`)이다:
리다이렉트면 잠금 탭에서, 계정 유형 선택 화면이면 "쿠팡 wing 로그인"을 한 번 누르고(페이지 호출 `content/ad-center/account-choice.js`,
자격증명 없음 — 옛 `ads-report.js`가 하던 이동 클릭) xauth의 Wing과 같은 아이디·비밀번호 폼을 실행 자격으로 채운 뒤 한 번
다시 묻는다. 보고서 생성(`requestReport`)은 첫 500에도 다시 묻지 않는다(보고서가 두 번 생기지 않게). 누를 버튼이 없거나 폼이 오지 않으면 `SITE_LOGIN_REQUIRED`(`login_unconfirmed`)로 멈춰 탭을 운영자에게 남긴다.
업체코드는 탭 화면의 "업체코드" 항목을
파일 주입(`content/ad-center/vendor-code.js`, 읽기만)으로 읽는다.

서버 준비 실행(claim, KID-386): owner가 자기 트랜잭션 안에서 `prepare`로 만들어 둔 실행(`prepared`)은 begin하지 않고
`runner.runClaimed`가 `POST /api/operations/claim`(세션 조직 안에서만)으로 받아 그 plan·lockKeys·토큰으로 begin 경로와 같은 순서
(자원 → 청크 → finish, `stopFor` 중지 규칙)를 돈다. 후보가 없으면 null이고, 모르는 kind를 받으면 바로 실패 finish로 돌려준다.
계기는 팝업 버튼 하나다(`entry/prepared-operations.ts`, 메시지 `runPreparedOperations` — 확장 팝업에서 온 것만, 준비 실행 kind만,
겹쳐 돌리지 않음). 후보가 없을 때까지(한 번에 20개까지) 하나씩 돌리고 결과 요약을 팝업에 답한다. 백그라운드 폴링은 두지 않는다
(사무실 PC가 늘 켜져 있지 않다). 수집기는 실패 finish에 실을 result를 `failureResult`로 줄 수 있다.

광고 액션(`advertising.ad_action`, KID-386): 승인된 `create_campaign` 하나를 광고센터에 적용한다. 잠금은
`resource:ad-action:<actionId>` 하나뿐이다 — 광고센터 계정 키를 쥐지 않으므로 보고서 수집과 같은 광고센터를 동시에 쓸 수 있고,
한 번에 하나씩 도는 것은 팝업 루프만 지킨다. 브라우저 자원이 탭을 주지 않으므로 `sites/ad-center`가 제 탭(`/marketing`)을 열어
업체코드를 읽고(보고서 수집과 같은 대조), 수집기가 캠페인 목록에서 같은 이름을 찾은 뒤(있으면 만들지 않는다) `createCampaign`이
`/marketing/campaign/type` → [다음] → `/registration`에서 이름·광고그룹·상품 검색/선택(계획의 id는 리스팅 옵션 id — `vendor_item` 행의 속성·글자로 맞춘다)·운영 방식·일 예산·목표 광고수익률을 채우고
[완료] → 확인 대화상자를 누른다(페이지 처리기 `content/page-call/ad-center-campaign-register.js`, ISOLATED). 규칙: 누르기 전 실패는
던진다(실패 finish, `not_attempted`; 칸이 없으면 `ADVERTISING_AD_CENTER_FORM_CHANGED`), 눌렀거나 누르는 호출의 답이 끊겼으면
던지지 않고 증거 청크(`ad_action_evidence`)를 낸다 — 캠페인 번호를 읽었거나 목록에서 이름으로 찾으면 `created`, 아니면 성공 finish의
`uncertain`(사람이 광고센터에서 확인). 쓴 탭은 운영자에게 남긴다. 셀렉터는 옛 content script가 마지막으로 확인한 것이고, 검증은
fixture jsdom 스펙뿐이다(실광고센터 쓰기 QA 금지).

몰 쓰기(KID-256, `channels.registration`·`channels.mall_availability_read`): 몰마다 `sites/<mall>/registration.ts`(등록 폼 명세나
전용 흐름 — 페이지 쪽은 `content/page-call/form-fill.js`와 전용 몰 `<mall>-register.js`)와 `sites/<mall>/availability.ts`(품절·재개·
가격·지금 상태 — 페이지 쪽은 `content/page-call/mall-availability*.js`)를 몰 키로 등록하고, 라우터 사이트 `sites/mall-write`가 plan의
몰 키로 찾는다. [등록]을 누를지는 관문 한 곳 `sites/mall-write/submit-gate.ts`만 정한다 — plan `submit`, 검증된 누르기(Wing만),
경고·수동 단계 없음 셋이 다 맞을 때만([ADR-0019](../../docs/adr/0019-mall-registrations-submit-all-the-way.md)). 채운 쓰기 탭은 성공해도
운영자에게 남긴다(`TabPage.leave`). 쓰기 탭의 `confirm`은 거절하고 문장만 모은다(가드 write 모드). 몰의 `alert`·`confirm`은
바꿔 끼우지 않는다 — 예외 둘은 채우는 동안만 바꾸고 되돌린다: 롯데ON 화면 알림 함수(`com.alert`·`com.confirm`, DOM 대화상자라 가드가
닿지 않는다, `lotte-on-register.js`)와 도매꾹 작성하기 에디터 팝업 창의 `alert`(가드가 없는 새 창, `form-fill.js` `driveDetailEditor`).
채우는 동안 허용된 몰 쓰기는 사진·상세 파일을 그 몰의 업로드 엔드포인트에 올리는 POST뿐이다(에디터 사진 버튼·업로드 창이 쓰는 곳 —
상품을 만들거나 저장하지 않는다). 품절·재개는 보낸 뒤 몰을 다시 읽은 것만 리스팅마다 증거로 싣는다(옵션 단위 몰은 `observedOptions`, 리스팅 단위 몰은
`observedStatus`). 대표이미지(`sites/wing/thumbnail.ts`)는 올리기만 하고 [저장]은 운영자가 누른다.

새 수집은 collectors/sites에만 추가하고, 서버 통신은 operation client만 쓴다. 등록은 `entry/index.ts`의
import 한 줄씩(수집기 하나, 사이트 하나)이다.
