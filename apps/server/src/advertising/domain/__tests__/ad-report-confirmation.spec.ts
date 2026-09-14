import { describe, expect, it } from 'vitest';
import {
  adReportEvidenceCutoff,
  confirmedAdReportEnd,
  type ObservedDaySpend,
} from '../ad-report-confirmation';

/** The totals a collection observed; a date absent from `days` was not observed. */
function observed(days: Record<string, number>): ObservedDaySpend {
  return (businessDate) => days[businessDate];
}

describe('confirmedAdReportEnd', () => {
  const closedDay = '2026-09-13';

  it('holds a zero closed day after a day with spend', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: closedDay,
      closedDay,
      daySpend: observed({ '2026-09-12': 68_655, '2026-09-13': 0 }),
    })).toBe('2026-09-12');
  });

  it('accepts a zero closed day after a zero day, because the account was not advertising', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: closedDay,
      closedDay,
      daySpend: observed({ '2026-09-12': 0, '2026-09-13': 0 }),
    })).toBe(closedDay);
  });

  it('accepts a closed day with spend', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: closedDay,
      closedDay,
      daySpend: observed({ '2026-09-12': 0, '2026-09-13': 1_200 }),
    })).toBe(closedDay);
  });

  it('holds a closed day the collection never observed', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: closedDay,
      closedDay,
      daySpend: observed({ '2026-09-12': 0 }),
    })).toBe('2026-09-12');
  });

  it('holds a one-day manual report on its closed day with zero spend', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: closedDay,
      closedDay,
      daySpend: observed({ '2026-09-13': 0 }),
    })).toBe('2026-09-12');
  });

  it('does not hold a seven-day manual report, which observes only its range total', () => {
    expect(confirmedAdReportEnd({ requestedEnd: closedDay, closedDay, daySpend: null }))
      .toBe(closedDay);
  });

  it('does not hold a collection that ends before its closed day', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: '2026-09-05',
      closedDay,
      daySpend: observed({ '2026-09-05': 0 }),
    })).toBe('2026-09-05');
  });

  it('holds the first day of a month back into the previous month', () => {
    expect(confirmedAdReportEnd({
      requestedEnd: '2026-10-01',
      closedDay: '2026-10-01',
      daySpend: observed({ '2026-09-30': 500, '2026-10-01': 0 }),
    })).toBe('2026-09-30');
  });
});

describe('adReportEvidenceCutoff', () => {
  const closedDay = '2026-09-13';

  it('requires the closed day when no complete collection requested it', () => {
    expect(adReportEvidenceCutoff({ closedDay, collections: [] })).toBe(closedDay);
    expect(adReportEvidenceCutoff({ closedDay, collections: [null] })).toBe(closedDay);
    expect(adReportEvidenceCutoff({
      closedDay,
      collections: [{ requestedEnd: '2026-09-12', confirmedEnd: '2026-09-12' }],
    })).toBe(closedDay);
  });

  it('moves back to the earliest confirmed end when every account held the closed day', () => {
    expect(adReportEvidenceCutoff({
      closedDay,
      collections: [
        { requestedEnd: closedDay, confirmedEnd: '2026-09-12' },
        { requestedEnd: closedDay, confirmedEnd: '2026-09-11' },
      ],
    })).toBe('2026-09-11');
  });

  it('keeps the closed day when one account held it and another did not', () => {
    expect(adReportEvidenceCutoff({
      closedDay,
      collections: [
        { requestedEnd: closedDay, confirmedEnd: '2026-09-12' },
        { requestedEnd: closedDay, confirmedEnd: closedDay },
      ],
    })).toBe(closedDay);
    expect(adReportEvidenceCutoff({
      closedDay,
      collections: [{ requestedEnd: closedDay, confirmedEnd: '2026-09-12' }, null],
    })).toBe(closedDay);
  });

  it('keeps the closed day for a days-old collection, so the source is not ready', () => {
    expect(adReportEvidenceCutoff({
      closedDay,
      collections: [{ requestedEnd: '2026-09-10', confirmedEnd: '2026-09-09' }],
    })).toBe(closedDay);
  });
});
