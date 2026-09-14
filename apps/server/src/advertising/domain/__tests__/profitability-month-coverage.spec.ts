import { describe, expect, it } from 'vitest';
import { clampProfitabilityMonthCoverage } from '../profitability-month-coverage';

describe('clampProfitabilityMonthCoverage', () => {
  it('counts a whole 31-day month inclusively', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2026-01-01',
      factTo: '2026-01-31',
      sliceFrom: '2026-01-01',
      sliceTo: '2026-01-31',
    })).toEqual({ from: '2026-01-01', to: '2026-01-31', coveredDays: 31 });
  });

  it('counts a leap February inclusively', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2028-02-01',
      factTo: '2028-02-29',
      sliceFrom: '2028-02-01',
      sliceTo: '2028-02-29',
    })).toEqual({ from: '2028-02-01', to: '2028-02-29', coveredDays: 29 });
  });

  it('clamps to the overlap when the fact window starts inside the slice', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2026-01-20',
      factTo: '2026-02-10',
      sliceFrom: '2026-01-01',
      sliceTo: '2026-01-31',
    })).toEqual({ from: '2026-01-20', to: '2026-01-31', coveredDays: 12 });
  });

  it('counts a single day as one covered day', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2026-03-01',
      factTo: '2026-03-01',
      sliceFrom: '2026-03-01',
      sliceTo: '2026-03-01',
    })).toEqual({ from: '2026-03-01', to: '2026-03-01', coveredDays: 1 });
  });

  it('rejects a window whose month boundary leaves no overlap', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2026-02-01',
      factTo: '2026-02-28',
      sliceFrom: '2026-01-01',
      sliceTo: '2026-01-31',
    })).toBeNull();
  });

  it('rejects a calendar date that does not exist', () => {
    expect(clampProfitabilityMonthCoverage({
      factFrom: '2026-02-30',
      factTo: '2026-02-28',
      sliceFrom: '2026-02-01',
      sliceTo: '2026-02-28',
    })).toBeNull();
  });
});
