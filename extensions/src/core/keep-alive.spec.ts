import { describe, expect, it } from 'vitest';
import { createKeepAlive, KEEP_ALIVE_PING_MS } from './keep-alive';

function fakeTimers() {
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    intervals,
    setInterval: (fn: () => void, ms: number) => {
      const id = next++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id: unknown) => void intervals.delete(id as number),
    tick() {
      for (const { fn } of intervals.values()) fn();
    },
  };
}

describe('서비스워커 keep-alive(참조 카운트)', () => {
  it('작업이 하나라도 있으면 20초마다 한 번만 깨우고, 마지막 작업이 끝나면 멈춘다', async () => {
    const timers = fakeTimers();
    let pings = 0;
    const keepAlive = createKeepAlive({ ping: () => void (pings += 1), setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let finishA!: () => void;
    let failB!: (error: Error) => void;
    const a = keepAlive.during(new Promise<void>((resolve) => (finishA = resolve)));
    const b = keepAlive.during(new Promise<void>((_resolve, reject) => (failB = reject)));
    expect(keepAlive.holders).toBe(2);
    expect([...timers.intervals.values()].map((entry) => entry.ms)).toEqual([KEEP_ALIVE_PING_MS]);
    timers.tick();
    expect(pings).toBe(1);
    finishA();
    await a;
    expect(timers.intervals.size).toBe(1);
    failB(new Error('boom'));
    await expect(b).rejects.toThrow('boom');
    expect(keepAlive.holders).toBe(0);
    expect(timers.intervals.size).toBe(0);
    expect(KEEP_ALIVE_PING_MS).toBe(20_000);
  });

  it('release는 여러 번 불러도 한 번만 센다', () => {
    const timers = fakeTimers();
    const keepAlive = createKeepAlive({ ping: () => undefined, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const release = keepAlive.acquire();
    keepAlive.acquire();
    release();
    release();
    expect(keepAlive.holders).toBe(1);
  });

  it('깨우기가 던져도 작업을 멈추지 않는다', () => {
    const timers = fakeTimers();
    const keepAlive = createKeepAlive({ ping: () => { throw new Error('worker closing'); }, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    keepAlive.acquire();
    expect(() => timers.tick()).not.toThrow();
  });
});
