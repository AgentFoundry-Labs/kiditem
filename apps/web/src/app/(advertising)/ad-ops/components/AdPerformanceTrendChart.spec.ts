import { describe, expect, it } from 'vitest';
import { toAxisLabel } from './AdPerformanceTrendChart';

// 쿠팡 광고센터 성과 그래프의 X축은 `07/01(수)` 처럼 요일까지 포함한다.
describe('toAxisLabel', () => {
  it('formats a business date as MM/DD(요일)', () => {
    expect(toAxisLabel('2026-07-01')).toBe('07/01(수)');
    expect(toAxisLabel('2026-07-19')).toBe('07/19(일)');
    expect(toAxisLabel('2026-07-20')).toBe('07/20(월)');
  });

  it('zero-pads single digit months and days', () => {
    expect(toAxisLabel('2026-01-05')).toBe('01/05(월)');
  });

  it('returns the raw value when the date is unparseable', () => {
    expect(toAxisLabel('')).toBe('');
    expect(toAxisLabel('not-a-date')).toBe('not-a-date');
  });
});
