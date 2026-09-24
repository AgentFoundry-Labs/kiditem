import { describe, expect, it } from 'vitest';
import { shownDiscountRate, tomorrowLabel } from './MobilePreview';

describe('MobilePreview helpers', () => {
  it('names tomorrow by the KST weekday instead of a fixed 수요일', () => {
    // 2026-09-24 is a Thursday in KST (13:00 KST = 04:00Z), so tomorrow is 금.
    expect(tomorrowLabel(new Date('2026-09-24T04:00:00Z'))).toBe('내일(금)');
    // 2026-09-26 23:30 KST is still Saturday in KST although it is Sunday nowhere yet in UTC terms.
    expect(tomorrowLabel(new Date('2026-09-26T14:30:00Z'))).toBe('내일(일)');
  });

  it('derives the discount from the prices when the operator left 할인율 empty', () => {
    expect(shownDiscountRate(0, 15000, 12000)).toBe(20);
    expect(shownDiscountRate(35, 15000, 12000)).toBe(35);
    expect(shownDiscountRate(0, 0, 12000)).toBe(0);
    expect(shownDiscountRate(0, 12000, 12000)).toBe(0);
  });
});
