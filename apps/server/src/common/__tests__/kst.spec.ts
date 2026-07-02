import { describe, expect, it } from 'vitest';
import { kstBusinessDate, kstDayStart } from '../kst';

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
