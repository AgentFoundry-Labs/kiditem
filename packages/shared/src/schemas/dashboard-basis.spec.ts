import { describe, expect, it } from 'vitest';
import {
  buildPeriodBasis,
  buildSnapshotBasis,
  enumerateDashboardDates,
  intersectBases,
  narrowToDate,
  periodBasisMissingDates,
  periodBasisStatus,
  snapshotBasisPartial,
  snapshotBasisStatus,
  type DashboardPeriodBasisStatus,
} from './dashboard-basis.js';
import {
  DashboardPeriodBasisSchema,
  DashboardSnapshotBasisSchema,
  type DashboardPeriodBasis,
} from './dashboard.js';

/**
 * The builders are the only producers of the dashboard evidence contract and
 * the derivations beside them are what every reader asks, so these tables are
 * what the contract rests on: sorted unique dates inside the range, the
 * status word, and the missing dates.
 */
describe('buildPeriodBasis', () => {
  const range = { from: '2026-09-01', to: '2026-09-05' } as const;
  const allDates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

  const cases: {
    name: string;
    input: Parameters<typeof buildPeriodBasis>[0];
    status: DashboardPeriodBasisStatus;
    missingDates?: string[];
    expected: Partial<DashboardPeriodBasis>;
  }[] = [
    {
      name: 'every selected date collected is complete',
      input: { ...range, includedDates: allDates, sources: ['orders'] },
      status: 'complete',
      missingDates: [],
      expected: { targetDays: 5, includedDates: allDates, invalidDates: [] },
    },
    {
      name: 'a source cutoff mid-range is partial with the tail missing',
      input: {
        ...range,
        includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
        sources: ['coupang_ads'],
      },
      status: 'partial',
      missingDates: ['2026-09-04', '2026-09-05'],
      expected: { includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'] },
    },
    {
      name: 'an internal hole stays visible instead of a continuous min/max range',
      input: {
        ...range,
        includedDates: ['2026-09-05', '2026-09-01', '2026-09-04'],
        sources: ['wing_traffic'],
      },
      status: 'partial',
      missingDates: ['2026-09-02', '2026-09-03'],
      expected: { includedDates: ['2026-09-01', '2026-09-04', '2026-09-05'] },
    },
    {
      name: 'invalid dates are excluded from included and reported as missing',
      input: {
        ...range,
        includedDates: allDates,
        invalidDates: ['2026-09-02'],
        sources: ['sellpia_sales'],
      },
      status: 'partial',
      missingDates: ['2026-09-02'],
      expected: {
        includedDates: ['2026-09-01', '2026-09-03', '2026-09-04', '2026-09-05'],
        invalidDates: ['2026-09-02'],
      },
    },
    {
      name: 'normal empty collection is empty, not a query failure',
      input: { ...range, includedDates: [], sources: ['orders'] },
      status: 'empty',
      missingDates: allDates,
      expected: { includedDates: [] },
    },
    {
      name: 'a failed required read with no usable input is unverified',
      input: {
        ...range,
        includedDates: [],
        sources: ['coupang_ads'],
        queryFailedSources: ['coupang_ads'],
      },
      status: 'unverified',
      missingDates: allDates,
      expected: { includedDates: [], queryFailedSources: ['coupang_ads'] },
    },
    {
      name: 'a failed read that still left valid dates stays partial and names the source',
      input: {
        ...range,
        includedDates: ['2026-09-01', '2026-09-02'],
        sources: ['orders', 'coupang_ads'],
        queryFailedSources: ['coupang_ads', 'coupang_ads'],
      },
      status: 'partial',
      expected: { includedDates: ['2026-09-01', '2026-09-02'], queryFailedSources: ['coupang_ads'] },
    },
    {
      name: 'duplicate and out-of-range evidence is normalized away',
      input: {
        ...range,
        includedDates: ['2026-09-02', '2026-09-02', '2026-08-31', '2026-09-30'],
        sources: ['orders', 'orders'],
      },
      status: 'partial',
      expected: { includedDates: ['2026-09-02'], sources: ['orders'] },
    },
  ];

  it.each(cases)('$name', ({ input, status, missingDates, expected }) => {
    const basis = buildPeriodBasis(input);
    expect(basis).toMatchObject(expected);
    expect(periodBasisStatus(basis)).toBe(status);
    if (missingDates) expect(periodBasisMissingDates(basis)).toEqual(missingDates);
    // Whatever the inputs, the produced payload is a valid wire basis, and the
    // derivations partition the selected range the same way every time.
    expect(DashboardPeriodBasisSchema.safeParse(basis).success).toBe(true);
    const missing = periodBasisMissingDates(basis);
    expect(basis.includedDates.length + missing.length).toBe(basis.targetDays);
    for (const date of basis.invalidDates) {
      expect(missing).toContain(date);
    }
    // The optional key is omitted rather than published as an empty array.
    expect('queryFailedSources' in basis)
      .toBe([...(input.queryFailedSources ?? [])].length > 0);
  });

  it('rejects a nameless basis', () => {
    expect(() => buildPeriodBasis({ ...range, sources: [] })).toThrow(TypeError);
  });

  it('enumerates inclusive bounds across a month boundary', () => {
    expect(enumerateDashboardDates('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02',
    ]);
  });

  it('treats an inverted range as an empty selection', () => {
    const basis = buildPeriodBasis({ from: '2026-09-05', to: '2026-09-01', sources: ['orders'] });
    expect(basis).toMatchObject({ targetDays: 0, includedDates: [] });
    expect(periodBasisStatus(basis)).toBe('empty');
    expect(enumerateDashboardDates('2026-09-05', '2026-09-01')).toEqual([]);
  });
});

describe('intersectBases', () => {
  const orders = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-05',
    includedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    sources: ['orders'],
  });
  const ads = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-05',
    includedDates: ['2026-09-03', '2026-09-04', '2026-09-05'],
    sources: ['coupang_ads'],
  });

  it('keeps only dates every required source covered', () => {
    const profit = intersectBases(orders, ads);
    expect(profit).toMatchObject({
      includedDates: ['2026-09-03', '2026-09-04'],
      sources: ['orders', 'coupang_ads'],
    });
    expect(periodBasisStatus(profit)).toBe('partial');
    expect(periodBasisMissingDates(profit)).toEqual(['2026-09-01', '2026-09-02', '2026-09-05']);
  });

  it('is empty when two sources share no valid date', () => {
    const early = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-04',
      includedDates: ['2026-09-01', '2026-09-02'],
      sources: ['orders'],
    });
    const late = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-04',
      includedDates: ['2026-09-03', '2026-09-04'],
      sources: ['sellpia_sales'],
    });
    const none = intersectBases(early, late);
    expect(none.includedDates).toEqual([]);
    expect(periodBasisStatus(none)).toBe('empty');
    expect(periodBasisMissingDates(none)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('propagates a failed read as unverified when nothing usable survives', () => {
    const failedAds = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-05',
      includedDates: [],
      sources: ['coupang_ads'],
      queryFailedSources: ['coupang_ads'],
    });
    const failed = intersectBases(orders, failedAds);
    expect(failed).toMatchObject({ includedDates: [], queryFailedSources: ['coupang_ads'] });
    expect(periodBasisStatus(failed)).toBe('unverified');
  });

  it('narrows the selected range to the overlap of differently clipped windows', () => {
    const clippedAds = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-04',
      includedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
      sources: ['coupang_ads'],
    });
    const clipped = intersectBases(orders, clippedAds);
    expect(clipped).toMatchObject({ from: '2026-09-01', to: '2026-09-04', targetDays: 4 });
    expect(periodBasisStatus(clipped)).toBe('complete');
  });

  it('keeps a date rejected by one source invalid for the combination', () => {
    const invalidAds = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-05',
      includedDates: ['2026-09-03', '2026-09-04', '2026-09-05'],
      invalidDates: ['2026-09-04'],
      sources: ['coupang_ads'],
    });
    expect(intersectBases(orders, invalidAds)).toMatchObject({
      includedDates: ['2026-09-03'],
      invalidDates: ['2026-09-04'],
    });
  });
});

describe('narrowToDate', () => {
  const parent = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-03',
    includedDates: ['2026-09-01'],
    invalidDates: ['2026-09-02'],
    sources: ['sellpia_sales'],
  });

  it.each([
    ['2026-09-01', 'complete', { includedDates: ['2026-09-01'], invalidDates: [] }],
    ['2026-09-02', 'empty', { includedDates: [], invalidDates: ['2026-09-02'] }],
    ['2026-09-03', 'empty', { includedDates: [], invalidDates: [] }],
  ] as const)('narrows %s to its own one-day basis', (date, status, expected) => {
    const narrowed = narrowToDate(parent, date);
    expect(narrowed).toMatchObject({ from: date, to: date, targetDays: 1, ...expected });
    expect(periodBasisStatus(narrowed)).toBe(status);
    expect(narrowed.sources).toEqual(['sellpia_sales']);
  });

  it('keeps a failed source unverified on an uncovered date', () => {
    const failed = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-02',
      sources: ['coupang_ads'],
      queryFailedSources: ['coupang_ads'],
    });
    const narrowed = narrowToDate(failed, '2026-09-02');
    expect(narrowed.queryFailedSources).toEqual(['coupang_ads']);
    expect(periodBasisStatus(narrowed)).toBe('unverified');
  });
});

/**
 * The snapshot counterpart. Inventory, product counts and ABC read a stored
 * owner result, so their evidence is an as-of and a source validity rather
 * than an included/missing date partition. The age word derives from the same
 * facts every time: is there an owner result, and does its as-of reach the
 * as-of the reader needed. Both facts travel on the wire so a screen derives
 * the same word.
 */
describe('buildSnapshotBasis', () => {
  const cases: {
    name: string;
    input: Parameters<typeof buildSnapshotBasis>[0];
    asOf: string | null;
    status: 'current' | 'stale' | 'unavailable' | 'unknown';
  }[] = [
    {
      name: 'a live read is as-of the date it ran on, so it is current',
      input: { asOf: '2026-09-10', requiredAsOf: '2026-09-10', sources: ['products'] },
      asOf: '2026-09-10',
      status: 'current',
    },
    {
      name: 'an owner result past the needed as-of is still current',
      input: { asOf: '2026-09-11', requiredAsOf: '2026-09-10', sources: ['products'] },
      asOf: '2026-09-11',
      status: 'current',
    },
    {
      name: 'a stored result short of the asked-for cutoff is retained as stale',
      input: { asOf: '2026-07-31', requiredAsOf: '2026-08-31', sources: ['product_abc'] },
      asOf: '2026-07-31',
      status: 'stale',
    },
    {
      name: 'an owner that publishes no as-of leaves the age unknown, not absent',
      input: { asOf: null, requiredAsOf: '2026-08-31', sources: ['product_abc'] },
      asOf: null,
      status: 'unknown',
    },
    {
      name: 'a reader with no required as-of cannot call a real result stale',
      input: { asOf: '2026-08-31', sources: ['product_abc'] },
      asOf: '2026-08-31',
      status: 'unknown',
    },
    {
      name: 'a rolled-over date is not a calendar date, so the as-of is unknown',
      input: { asOf: '2026-02-30', requiredAsOf: '2026-02-28', sources: ['products'] },
      asOf: null,
      status: 'unknown',
    },
    {
      name: 'no owner result at all is unavailable and carries no as-of',
      input: { asOf: '2026-09-10', requiredAsOf: '2026-09-10', sources: ['coupang_ads'], measured: false },
      asOf: null,
      status: 'unavailable',
    },
  ];

  it.each(cases)('$name', ({ input, asOf, status }) => {
    const basis = buildSnapshotBasis(input);

    expect(DashboardSnapshotBasisSchema.safeParse(basis).success).toBe(true);
    expect(basis).toMatchObject({ kind: 'snapshot', asOf, measured: input.measured ?? true, withheldCount: 0 });
    expect(snapshotBasisStatus(basis)).toBe(status);
    // None of these producers withheld anything, so each value counted the
    // whole population it names.
    expect(snapshotBasisPartial(basis)).toBe(false);
  });

  it('declares a partly counted population without ageing the value', () => {
    // Coverage and freshness are independent: a count read today stays
    // `current` while saying it left members out.
    const partial = buildSnapshotBasis({
      asOf: '2026-09-10',
      requiredAsOf: '2026-09-10',
      sources: ['orders'],
      withheldCount: 2,
    });
    expect(partial.withheldCount).toBe(2);
    expect(snapshotBasisStatus(partial)).toBe('current');
    expect(snapshotBasisPartial(partial)).toBe(true);
  });

  it('explains an absent value by what was withheld without calling it partly counted', () => {
    // An empty measurable subset has no value to be partly counted, so the
    // withheld population is the reason rather than a qualifier.
    const absent = buildSnapshotBasis({
      sources: ['orders'],
      measured: false,
      withheldCount: 4,
    });
    expect(absent).toMatchObject({ measured: false, withheldCount: 4 });
    expect(snapshotBasisStatus(absent)).toBe('unavailable');
    expect(snapshotBasisPartial(absent)).toBe(false);
  });

  it('keeps the capture time of the result it read', () => {
    expect(buildSnapshotBasis({
      asOf: '2026-08-31',
      requiredAsOf: '2026-08-31',
      observedAt: new Date('2026-09-01T04:05:06.000Z'),
      sources: ['product_abc'],
    }).observedAt).toBe('2026-09-01T04:05:06.000Z');
  });

  it('drops the capture time of a result that does not exist', () => {
    expect(buildSnapshotBasis({
      observedAt: '2026-09-01T04:05:06.000Z',
      sources: ['coupang_ads'],
      measured: false,
    }).observedAt).toBeNull();
  });

  it('refuses a nameless basis the same way a period basis does', () => {
    expect(() => buildSnapshotBasis({ sources: [] })).toThrow(TypeError);
  });
});
