/**
 * 서비스워커 유휴 종료 막기(KID-366, 옛 `worker-globals.js` `KidItemWorkerKeepAlive`를 옮겼다). MV3 서비스워커는 30초
 * 무활동이면 종료되어, 몇 분 걸리는 응답이 "message channel closed"로 사라진다. 붙든 작업이 하나라도 있으면 20초마다
 * 한 번 깨우고(`ping`, 입구가 `chrome.runtime.getPlatformInfo`로 묶는다), 마지막 작업이 끝나면 멈춘다.
 */
export const KEEP_ALIVE_PING_MS = 20_000;

export interface KeepAlive {
  /** 작업 하나를 붙든다. 돌려준 release는 여러 번 불러도 한 번만 센다. */
  acquire(): () => void;
  /** 프로미스가 끝날 때까지 붙든다(성공·실패 모두 놓는다). */
  during<T>(work: Promise<T>): Promise<T>;
  readonly holders: number;
}

export interface KeepAliveDeps {
  ping(): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export function createKeepAlive(deps: KeepAliveDeps): KeepAlive {
  let holders = 0;
  let timer: unknown = null;
  const ping = () => {
    try {
      deps.ping();
    } catch {
      // 워커가 끝나는 순간의 호출은 버린다 — 다음 번에 다시 깨운다.
    }
  };
  function acquire(): () => void {
    holders += 1;
    if (timer === null) timer = deps.setInterval(ping, KEEP_ALIVE_PING_MS);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holders = Math.max(0, holders - 1);
      if (holders === 0 && timer !== null) {
        deps.clearInterval(timer);
        timer = null;
      }
    };
  }
  return {
    acquire,
    during(work) {
      const release = acquire();
      return Promise.resolve(work).finally(release);
    },
    get holders() {
      return holders;
    },
  };
}
