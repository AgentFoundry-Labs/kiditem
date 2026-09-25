// 확장 TypeScript 런타임의 진입점. esbuild 가 IIFE 로 묶고 `globalName`
// `KidItemRuntime` 에 이 모듈의 export 를 싣는다(extensions/scripts/build-runtime.mjs).
// 서비스워커는 옛 JS 모듈을 모두 실은 뒤 마지막에 이 번들을 싣는다.
//
// 빌드 시각이나 매니페스트 버전 같은 값은 번들에 넣지 않는다 — 번들이 커밋되고 CI 가
// `--check` 로 바이트 동일성을 보므로 출력은 src 에만 달려야 한다. 버전은 설치된
// 매니페스트에서 실행 시점에 읽는다.
export function version(): string {
  return chrome.runtime.getManifest().version;
}

// `@kiditem/shared/*` 는 tsconfig `paths` 로 packages/shared/src 소스를 직접 묶는다
// (dist 의 .d.ts 가 없는 CI 에서도 tsc·esbuild 가 같은 소스를 본다).
export { OPERATION_STATUSES } from '@kiditem/shared/operation';
