# extensions/src — 확장 TypeScript 소스

`extensions/src/`는 확장 런타임의 TypeScript 소스다. `extensions/scripts/build-runtime.mjs`가
esbuild로 IIFE 하나(`globalName: KidItemRuntime`)로 묶어
`extensions/kiditem-os/runtime/kiditem-runtime.js`에 쓰고, 서비스워커가 옛 JS 모듈 뒤에
싣는다. 규약: 브라우저 API는 `chrome.*`만 쓴다. `import.meta`와 번들러 전용 API(동적
`import()`, `require`, 환경 변수 치환 등)는 쓰지 않는다. `func.toString()`으로 함수 소스를
페이지에 주입하지 않는다(번들이 이름을 바꾸고 바깥 스코프를 끌어들인다).
`@kiditem/shared`는 import해도 되며 번들에 포함된다. 폴더는 4층이고 의존은 한 방향이다(KID-357, `npm run check:extension-runtime-layers`):

- `entry/` — 웹앱·팝업이 부르는 액션 표 → core. 로직 없음. 수집기가 선언한 사이트 이름으로 등록표에서 핸들을
  조립한다(`entry/site-handles.ts`, 사이트별 분기 없음). 옛 전역(`KidItemDomains` 등)은
  `entry/legacy-bridge.ts` 한 파일만 참조한다.
- `core/` — operation client(서버 실행 계약의 유일한 창구), runner(begin → 청크 → finish 순서),
  브라우저 자원(창·탭·로그인, 이름은 서버 lockKey와 같다), 사이트 호출기(간격·XSRF), 오류.
  core는 core만 import한다.
- `collectors/<kind>/` — 서버 kind 문자열과 같은 이름. `collect(plan, site) → 청크 스트림`.
  서버·탭·토큰을 모른다: core 중 `site-caller`·`errors`만 쓴다.
- `sites/<site>/` — 사이트 API·DOM 읽기·쓰기만. core 중 `site-caller`·`errors`만 쓴다. 사이트는 파일 끝에서
  `registerSite`(`sites/registry.ts`)로 스스로 등록하고, 입구는 이름으로 조립한다(KID-355).
  content script는 API가 없어 DOM을 읽어야 할 때만, 페이지 주입은 파일 주입만.

새 수집은 collectors/sites에만 추가하고, 서버 통신은 operation client만 쓴다. 등록은 `entry/index.ts`의
import 한 줄씩(수집기 하나, 사이트 하나)이다.
