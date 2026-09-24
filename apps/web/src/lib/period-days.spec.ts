import { describe, expect, it } from 'vitest';
import {
  partialPeriodDaysText,
  periodCoverageDaysText,
  periodDaysText,
  trafficCoverageBasis,
} from './period-days';

/**
 * "부분 N/M일" 은 한 곳에서 만든다(KID-232). 판단은 `periodBasisStatus` 이고(ADR-0006), 대시보드 ·
 * 상품 허브 · 재무 안내가 같은 문구를 쓴다.
 */
describe('period days text', () => {
  const partial = { includedDates: ['2026-09-01', '2026-09-03'], targetDays: 3 };
  const complete = { includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'], targetDays: 3 };
  const empty = { includedDates: [], targetDays: 3 };

  it('counts measured days over the target', () => {
    expect(periodDaysText(partial)).toBe('2/3일');
    expect(periodDaysText(empty)).toBe('0/3일');
  });

  it('says 부분 N/M일 only for a partly measured period', () => {
    expect(partialPeriodDaysText(partial)).toBe('부분 2/3일');
    expect(partialPeriodDaysText(complete)).toBeNull();
    expect(partialPeriodDaysText(empty)).toBeNull();
  });

  it('says M/M일 for a complete period and nothing for an unmeasured one', () => {
    expect(periodCoverageDaysText(complete)).toBe('3/3일');
    expect(periodCoverageDaysText(partial)).toBe('부분 2/3일');
    expect(periodCoverageDaysText(empty)).toBeNull();
    expect(periodCoverageDaysText({ includedDates: [], targetDays: 3, queryFailedSources: ['wing_traffic'] as never })).toBeNull();
  });

  it('reads a Wing traffic coverage as the dates it did not miss', () => {
    const basis = trafficCoverageBasis({
      from: '2026-09-01', to: '2026-09-03', targetDays: 3, completedDays: 2, missingDates: ['2026-09-02'],
    });
    expect(basis).toEqual({ includedDates: ['2026-09-01', '2026-09-03'], targetDays: 3 });
    expect(periodCoverageDaysText(basis)).toBe('부분 2/3일');
  });
});
