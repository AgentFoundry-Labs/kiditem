import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  kstBusinessDate,
  parseBusinessDate,
  shiftBusinessDateKey,
  toBusinessDate,
} from './common';

describe('KST business dates', () => {
  it('uses the Korean calendar date during the UTC afternoon rollover', () => {
    expect(businessDateKey(kstBusinessDate(new Date('2026-09-12T15:30:00.000Z'))))
      .toBe('2026-09-13');
  });

  it('returns the latest closed Korean business date', () => {
    expect(businessDateKey(evidenceCutoffDate(new Date('2026-09-12T15:30:00.000Z'))))
      .toBe('2026-09-12');
  });

  it('adds and enumerates calendar days across month boundaries', () => {
    const start = parseBusinessDate('2024-02-28');
    const end = parseBusinessDate('2024-03-01');

    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(businessDateKey(addDays(start!, 1))).toBe('2024-02-29');
    expect(datesInclusive(start!, end!).map(businessDateKey)).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
    expect(shiftBusinessDateKey('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('rejects invalid calendar dates instead of normalizing them', () => {
    expect(parseBusinessDate('2026-02-29')).toBeNull();
    expect(parseBusinessDate('2026-9-1')).toBeNull();
  });

  it('normalizes provider timestamps and loose calendar input to one KST business date', () => {
    expect(businessDateKey(toBusinessDate('2026-05-18T15:30:00.000Z')!))
      .toBe('2026-05-19');
    expect(businessDateKey(toBusinessDate('2026-5-9')!)).toBe('2026-05-09');
    expect(toBusinessDate('not-a-date')).toBeNull();
  });
});
