// 확장 TypeScript 런타임의 진입점. esbuild 가 IIFE 로 묶고 `globalName`
// `KidItemRuntime` 에 이 모듈의 export 를 싣는다(extensions/scripts/build-runtime.mjs).
// 서비스워커는 옛 JS 모듈을 모두 실은 뒤 마지막에 이 번들을 싣는다.
//
// 빌드 시각 같은 값은 넣지 않는다 — 번들이 커밋되고 CI 가 `--check` 로 바이트
// 동일성을 보므로 출력은 결정적이어야 한다.
import { version as manifestVersion } from '../kiditem-os/manifest.json';

export const version: string = manifestVersion;

// `@kiditem/shared/*` 는 tsconfig `paths` 로 packages/shared/src 소스를 직접 묶는다
// (dist 의 .d.ts 가 없는 CI 에서도 tsc·esbuild 가 같은 소스를 본다).
export { OPERATION_STATUSES } from '@kiditem/shared/operation';
