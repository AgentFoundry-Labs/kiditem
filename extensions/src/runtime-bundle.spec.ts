import { describe, expect, it } from 'vitest';
import bundleSource from '../kiditem-os/runtime/kiditem-runtime.js?raw';

// 커밋된 번들(서비스워커가 싣는 바로 그 파일)을 classic script 처럼 실행한다.
// `extension:check` 가 이 파일이 src 의 새 빌드와 바이트까지 같은지 따로 본다.
function loadRuntime(chrome: unknown): Record<string, unknown> {
  return new Function('chrome', `${bundleSource}\nreturn KidItemRuntime;`)(chrome);
}

describe('committed runtime bundle', () => {
  it('bundles @kiditem/shared sources into the one KidItemRuntime global', () => {
    const runtime = loadRuntime({});

    expect(runtime.OPERATION_STATUSES).toEqual(['executing', 'succeeded', 'failed', 'cancelled']);
  });

  it('reads the version from the installed manifest, so a version bump needs no rebuild', () => {
    const runtime = loadRuntime({ runtime: { getManifest: () => ({ version: '9.8.7' }) } });

    expect((runtime.version as () => string)()).toBe('9.8.7');
  });
});
