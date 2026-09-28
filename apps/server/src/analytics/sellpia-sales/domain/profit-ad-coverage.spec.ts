import { describe, expect, it } from 'vitest';
import { profitAdCostMeasured } from './profit-ad-coverage';

// 이익 광고비는 요청 기간의 닫힌 날을 광고 보고서가 모두 측정했을 때만 측정값이다(ADR-0006, KID-45) —
// 손익(per-listing-profit `coversWindow`)과 같은 답.
describe('profitAdCostMeasured', () => {
  const requested = ['2026-09-01', '2026-09-02', '2026-09-03'];

  it('요청 기간의 닫힌 날을 모두 측정했으면 측정값이다', () => {
    expect(profitAdCostMeasured({
      requestedDates: requested,
      knownThrough: '2026-09-03',
      measuredAdDates: new Set(requested),
    })).toBe(true);
  });

  it('닫힌 날 하나라도 측정하지 않았으면 보류다 — 매출이 있는 날만 측정했어도', () => {
    expect(profitAdCostMeasured({
      requestedDates: requested,
      knownThrough: '2026-09-03',
      measuredAdDates: new Set(['2026-09-02', '2026-09-03']),
    })).toBe(false);
  });

  it('아직 닫히지 않은 날은 요구하지 않는다', () => {
    expect(profitAdCostMeasured({
      requestedDates: requested,
      knownThrough: '2026-09-02',
      measuredAdDates: new Set(['2026-09-01', '2026-09-02']),
    })).toBe(true);
  });

  it('닫힌 날이 없는 기간은 측정값이 아니다', () => {
    expect(profitAdCostMeasured({
      requestedDates: requested,
      knownThrough: '2026-08-31',
      measuredAdDates: new Set(),
    })).toBe(false);
  });
});
