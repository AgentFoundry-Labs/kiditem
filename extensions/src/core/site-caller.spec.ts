import { describe, expect, it } from 'vitest';
import { delayUntilNext } from './site-caller';

describe('delayUntilNext — 사이트 요청 간격', () => {
  it('첫 요청은 기다리지 않는다', () => {
    expect(delayUntilNext({ lastSentAt: null, now: 1_000, minIntervalMs: 2_200 })).toBe(0);
  });
  it('간격이 남았으면 남은 만큼 기다린다', () => {
    expect(delayUntilNext({ lastSentAt: 1_000, now: 1_500, minIntervalMs: 2_200 })).toBe(1_700);
  });
  it('간격이 지났으면 0', () => {
    expect(delayUntilNext({ lastSentAt: 1_000, now: 9_000, minIntervalMs: 2_200 })).toBe(0);
  });
});
