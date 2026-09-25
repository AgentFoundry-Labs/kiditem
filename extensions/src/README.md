# extensions/src — 확장 TypeScript 소스

`extensions/src/`는 확장 런타임의 TypeScript 소스다. `extensions/scripts/build-runtime.mjs`가
esbuild로 IIFE 하나(`globalName: KidItemRuntime`)로 묶어
`extensions/kiditem-os/runtime/kiditem-runtime.js`에 쓰고, 서비스워커가 옛 JS 모듈 뒤에
싣는다. 규약: 브라우저 API는 `chrome.*`만 쓴다. `import.meta`와 번들러 전용 API(동적
`import()`, `require`, 환경 변수 치환 등)는 쓰지 않는다. `func.toString()`으로 함수 소스를
페이지에 주입하지 않는다(번들이 이름을 바꾸고 바깥 스코프를 끌어들인다).
`@kiditem/shared`는 import해도 되며 번들에 포함된다. 폴더 구조(`entry/ core/ collectors/
sites/`)는 이 틀이 아니라 KID-357에서 정한다.
