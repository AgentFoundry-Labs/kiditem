// 확장 TypeScript 런타임의 진입점. esbuild 가 IIFE 로 묶고 `globalName`
// `KidItemRuntime` 에 이 모듈의 export 를 싣는다(extensions/scripts/build-runtime.mjs).
// 서비스워커는 옛 JS 모듈을 모두 실은 뒤 마지막에 이 번들을 싣고, 옛 워커 표를 `attachLegacyActions`로 넘긴다.
//
// 빌드 시각이나 매니페스트 버전 같은 값은 번들에 넣지 않는다 — 번들이 커밋되고 CI 가
// `--check` 로 바이트 동일성을 보므로 출력은 src 에만 달려야 한다. 버전은 설치된
// 매니페스트에서 실행 시점에 읽는다.
import { registeredKinds } from './collectors';
import type { LegacyExternalActions } from './core/dispatch';
import { installEntry } from './entry';

export function version(): string {
  return chrome.runtime.getManifest().version;
}

// `@kiditem/shared/*` 는 tsconfig `paths` 로 packages/shared/src 소스를 직접 묶는다
// (dist 의 .d.ts 가 없는 CI 에서도 tsc·esbuild 가 같은 소스를 본다).
export { OPERATION_STATUSES } from '@kiditem/shared/operation';

/** 이 번들이 아는 실행 kind(등록된 수집기). */
export const runtime = { kinds: registeredKinds };

const entry = installEntry();

/**
 * 과도기(KID-355 wave8b·wave9까지): 서비스워커가 옛 워커 표(셀피아·송장·카카오·수집 세션 액션과 그 capability)를 넘긴다.
 * 새 dispatch가 모르는 액션은 이 표로 넘어가고, `ping`은 이 표의 capability를 합친다.
 */
export function attachLegacyActions(table: LegacyExternalActions): void {
  entry?.attachLegacy(table);
}
