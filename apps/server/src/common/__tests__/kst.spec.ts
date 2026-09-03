import { describe, expect, it } from 'vitest';
import {
  kstBusinessDate,
  kstDayStart,
  kstMonthEnd,
  kstMonthRange,
} from '../kst';

describe('kstBusinessDate', () => {
  it('returns UTC midnight for the KST calendar day used by Postgres date columns', () => {
    expect(kstBusinessDate(new Date('2026-05-26T16:00:00.000Z')).toISOString())
      .toBe('2026-05-27T00:00:00.000Z');
  });

  it('differs from KST midnight instant because @db.Date comparisons use UTC-midnight dates', () => {
    const input = new Date('2026-05-26T16:00:00.000Z');

    expect(kstDayStart(input).toISOString()).toBe('2026-05-26T15:00:00.000Z');
    expect(kstBusinessDate(input).toISOString()).toBe('2026-05-27T00:00:00.000Z');
  });
});

describe('closed KST month helpers', () => {
  it('returns the previous month boundary regardless of UTC rollover', () => {
    expect(kstMonthEnd('2026-02')).toBe('2026-02-28');
    expect(kstMonthRange('2026-08-31', 3)).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});
