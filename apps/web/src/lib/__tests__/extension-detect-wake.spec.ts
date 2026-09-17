import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId } from '../extension-bridge';

/**
 * 잠든 확장과 없는 확장은 다르다.
 *
 * MV3 서비스워커는 놀면 내려간다. 깨어나는 첫 `ping` 은 모듈을 다시 읽는 시간을
 * 포함하는데, 예전 제한 1.2초는 그걸 못 버텨서 멀쩡한 확장을 "없다"고 말했다
 * (라이브 실측 2026-09-10: 따뜻한 상태의 왕복이 0.28~0.89초). 그러면 사람은
 * 확장을 또 리로드하고 같은 곳을 맴돈다.
 */
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

function installChrome(responseDelayMs: number, calls: number[]): void {
  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (
        _id: string,
        _message: unknown,
        callback: (response: unknown) => void,
      ) => {
        calls.push(responseDelayMs);
        setTimeout(
          () => callback({ success: true, capabilities: { kiditemEnvironmentProfilesV1: true } }),
          responseDelayMs,
        );
      },
    },
  };
}

describe('detectExtensionId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem('kiditem-ext-id', EXTENSION_ID);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    delete (window as unknown as { chrome?: unknown }).chrome;
  });

  it('바로 답하면 한 번만 물어본다', async () => {
    const calls: number[] = [];
    installChrome(100, calls);

    const promise = detectExtensionId();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe(EXTENSION_ID);
    expect(calls).toHaveLength(1);
  });

  it('자고 있어 첫 물음이 늦어도 깨어날 때까지 기다린다', async () => {
    // 콜드 스타트 2초. 예전 제한(1.2초)이었다면 "확장 없음"으로 끝났다.
    const calls: number[] = [];
    installChrome(2000, calls);

    const promise = detectExtensionId();
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).resolves.toBe(EXTENSION_ID);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
