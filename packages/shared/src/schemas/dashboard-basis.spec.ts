import { describe, expect, it } from 'vitest';
import {
  buildComparisonBasis,
  buildPeriodBasis,
  buildSnapshotBasis,
  enumerateDashboardDates,
  intersectBases,
  narrowToDate,
} from './dashboard-basis.js';
import {
  DashboardComparisonBasisSchema,
  DashboardPeriodBasisSchema,
  DashboardSnapshotBasisSchema,
  type DashboardPeriodBasis,
} from './dashboard.js';

/**
 * The builders are the only producers of the dashboard evidence contract, so
 * these tables are what the wire invariants now rest on: the partition,
 * `invalid ⊆ missing`, sorted unique dates, and the status vocabulary the
 * 2026-09-10 partial-aggregation amendment requires.
 */
describe('buildPeriodBasis', () => {
  const range = { from: '2026-09-01', to: '2026-09-05' } as const;
  const allDates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

  const cases: {
    name: string;
    input: Parameters<typeof buildPeriodBasis>[0];
    expected: Partial<DashboardPeriodBasis>;
  }[] = [
    {
      name: 'every selected date collected is complete',
      input: { ...range, includedDates: allDates, sources: ['orders'] },
      expected: {
        status: 'complete',
        partial: false,
        includedDays: 5,
        targetDays: 5,
        missingDates: [],
        invalidDates: [],
      },
    },
    {
      name: 'a source cutoff mid-range is partial with the tail missing',
      input: {
        ...range,
        includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
        sources: ['coupang_ads'],
      },
      expected: {
        status: 'partial',
        partial: true,
        includedDays: 3,
        missingDates: ['2026-09-04', '2026-09-05'],
      },
    },
    {
      name: 'an internal hole stays visible instead of a continuous min/max range',
      input: {
        ...range,
        includedDates: ['2026-09-05', '2026-09-01', '2026-09-04'],
        sources: ['wing_traffic'],
      },
      expected: {
        status: 'partial',
        includedDates: ['2026-09-01', '2026-09-04', '2026-09-05'],
        missingDates: ['2026-09-02', '2026-09-03'],
      },
    },
    {
      name: 'invalid dates are excluded from included and reported as missing',
      input: {
        ...range,
        includedDates: allDates,
        invalidDates: ['2026-09-02'],
        sources: ['sellpia_sales'],
      },
      expected: {
        status: 'partial',
        includedDays: 4,
        missingDates: ['2026-09-02'],
        invalidDates: ['2026-09-02'],
      },
    },
    {
      name: 'normal empty collection is empty, not a query failure',
      input: { ...range, includedDates: [], sources: ['orders'] },
      expected: {
        status: 'empty',
        partial: false,
        includedDays: 0,
        missingDates: allDates,
      },
    },
    {
      name: 'a failed required read with no usable input is unverified',
      input: {
        ...range,
        includedDates: [],
        sources: ['coupang_ads'],
        queryFailedSources: ['coupang_ads'],
      },
      expected: {
        status: 'unverified',
        partial: false,
        includedDays: 0,
        missingDates: allDates,
        queryFailedSources: ['coupang_ads'],
      },
    },
    {
      name: 'a failed read that still left valid dates stays partial and names the source',
      input: {
        ...range,
        includedDates: ['2026-09-01', '2026-09-02'],
        sources: ['orders', 'coupang_ads'],
        queryFailedSources: ['coupang_ads', 'coupang_ads'],
      },
      expected: {
        status: 'partial',
        includedDays: 2,
        queryFailedSources: ['coupang_ads'],
      },
    },
    {
      name: 'duplicate and out-of-range evidence is normalized away',
      input: {
        ...range,
        includedDates: ['2026-09-02', '2026-09-02', '2026-08-31', '2026-09-30'],
        sources: ['orders', 'orders'],
      },
      expected: {
        status: 'partial',
        includedDates: ['2026-09-02'],
        includedDays: 1,
        sources: ['orders'],
      },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    const basis = buildPeriodBasis(input);
    expect(basis).toMatchObject(expected);
    // Whatever the inputs, the produced payload is a valid wire basis.
    expect(DashboardPeriodBasisSchema.safeParse(basis).success).toBe(true);
    expect(basis.includedDays).toBe(basis.includedDates.length);
    expect(basis.includedDays + basis.missingDates.length).toBe(basis.targetDays);
    expect(basis.partial).toBe(basis.status === 'partial');
    for (const date of basis.invalidDates) {
      expect(basis.missingDates).toContain(date);
    }
    // The optional key is omitted rather than published as an empty array.
    expect('queryFailedSources' in basis)
      .toBe([...(input.queryFailedSources ?? [])].length > 0);
  });

  it('normalizes observedAt and rejects a nameless basis', () => {
    expect(buildPeriodBasis({
      ...range,
      sources: ['orders'],
      observedAt: new Date('2026-09-06T02:30:00.000Z'),
    }).observedAt).toBe('2026-09-06T02:30:00.000Z');
    expect(buildPeriodBasis({ ...range, sources: ['orders'], observedAt: 'not a date' }).observedAt)
      .toBeNull();
    expect(() => buildPeriodBasis({ ...range, sources: [] })).toThrow(TypeError);
  });

  it('enumerates inclusive bounds across a month boundary', () => {
    expect(enumerateDashboardDates('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02',
    ]);
  });

  it('treats an inverted range as an empty selection', () => {
    const basis = buildPeriodBasis({ from: '2026-09-05', to: '2026-09-01', sources: ['orders'] });
    expect(basis).toMatchObject({ targetDays: 0, includedDays: 0, status: 'empty' });
    expect(enumerateDashboardDates('2026-09-05', '2026-09-01')).toEqual([]);
  });
});

describe('intersectBases', () => {
  const orders = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-05',
    includedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    sources: ['orders'],
    observedAt: '2026-09-05T00:00:00.000Z',
  });
  const ads = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-05',
    includedDates: ['2026-09-03', '2026-09-04', '2026-09-05'],
    sources: ['coupang_ads'],
    observedAt: '2026-09-06T00:00:00.000Z',
  });

  it('keeps only dates every required source covered', () => {
    const profit = intersectBases(orders, ads);
    expect(profit).toMatchObject({
      status: 'partial',
      includedDates: ['2026-09-03', '2026-09-04'],
      missingDates: ['2026-09-01', '2026-09-02', '2026-09-05'],
      sources: ['orders', 'coupang_ads'],
      observedAt: '2026-09-06T00:00:00.000Z',
    });
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
    expect(intersectBases(early, late)).toMatchObject({
      status: 'empty',
      includedDays: 0,
      missingDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    });
  });

  it('propagates a failed read as unverified when nothing usable survives', () => {
    const failedAds = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-05',
      includedDates: [],
      sources: ['coupang_ads'],
      queryFailedSources: ['coupang_ads'],
    });
    expect(intersectBases(orders, failedAds)).toMatchObject({
      status: 'unverified',
      includedDays: 0,
      queryFailedSources: ['coupang_ads'],
    });
  });

  it('narrows the selected range to the overlap of differently clipped windows', () => {
    const clippedAds = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-04',
      includedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
      sources: ['coupang_ads'],
    });
    expect(intersectBases(orders, clippedAds)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-04',
      targetDays: 4,
      status: 'complete',
    });
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
    observedAt: '2026-09-04T00:00:00.000Z',
  });

  it.each([
    ['2026-09-01', { status: 'complete', includedDays: 1, invalidDates: [] }],
    ['2026-09-02', { status: 'empty', includedDays: 0, invalidDates: ['2026-09-02'] }],
    ['2026-09-03', { status: 'empty', includedDays: 0, invalidDates: [] }],
  ] as const)('narrows %s to its own one-day basis', (date, expected) => {
    const narrowed = narrowToDate(parent, date);
    expect(narrowed).toMatchObject({ from: date, to: date, targetDays: 1, ...expected });
    expect(narrowed.sources).toEqual(['sellpia_sales']);
    expect(narrowed.observedAt).toBe('2026-09-04T00:00:00.000Z');
  });

  it('accepts a per-date capture time', () => {
    expect(narrowToDate(parent, '2026-09-01', new Date('2026-09-01T10:00:00.000Z')).observedAt)
      .toBe('2026-09-01T10:00:00.000Z');
  });

  it('keeps a failed source unverified on an uncovered date', () => {
    const failed = buildPeriodBasis({
      from: '2026-09-01',
      to: '2026-09-02',
      sources: ['coupang_ads'],
      queryFailedSources: ['coupang_ads'],
    });
    expect(narrowToDate(failed, '2026-09-02')).toMatchObject({
      status: 'unverified',
      queryFailedSources: ['coupang_ads'],
    });
  });
});

describe('buildComparisonBasis', () => {
  const current = buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-03',
    includedDates: ['2026-09-01', '2026-09-03'],
    sources: ['orders'],
  });

  it('matches relative offsets that carry evidence on both sides', () => {
    const previous = buildPeriodBasis({
      from: '2026-08-29',
      to: '2026-08-31',
      includedDates: ['2026-08-29', '2026-08-30', '2026-08-31'],
      sources: ['orders'],
    });
    const comparison = buildComparisonBasis(current, previous);
    expect(comparison).toMatchObject({
      kind: 'comparison',
      matchedOffsets: [0, 2],
      status: 'comparable',
      reason: null,
    });
    expect(comparison.current.includedDates).toEqual(['2026-09-01', '2026-09-03']);
    expect(comparison.previous.includedDates).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
    expect(DashboardComparisonBasisSchema.safeParse(comparison).success).toBe(true);
  });

  it('is unavailable when the two periods share no matching offset', () => {
    const previous = buildPeriodBasis({
      from: '2026-08-29',
      to: '2026-08-31',
      includedDates: ['2026-08-30'],
      sources: ['orders'],
    });
    expect(buildComparisonBasis(current, previous)).toMatchObject({
      matchedOffsets: [],
      status: 'unavailable',
      reason: 'no shared valid dates',
    });
  });

  it('never calls a failed read comparable, and names the failed source', () => {
    const failed = buildPeriodBasis({
      from: '2026-08-29',
      to: '2026-08-31',
      sources: ['orders'],
      queryFailedSources: ['orders'],
    });
    expect(buildComparisonBasis(current, failed)).toMatchObject({
      matchedOffsets: [],
      status: 'unavailable',
      reason: 'source read failed: orders',
    });
  });

  it('compares only the offsets both windows actually span', () => {
    const shortPrevious = buildPeriodBasis({
      from: '2026-08-30',
      to: '2026-08-30',
      includedDates: ['2026-08-30'],
      sources: ['orders'],
    });
    expect(buildComparisonBasis(current, shortPrevious)).toMatchObject({
      matchedOffsets: [0],
      status: 'comparable',
    });
  });
});

/**
 * The snapshot counterpart. Inventory, product counts and ABC read a stored
 * owner result, so their evidence is an as-of and a source validity rather
 * than an included/missing date partition. Status derives from the same two
 * facts every time: is there an owner result, and does its as-of reach the
 * as-of the reader needed.
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
    // None of these producers withheld anything, so each value counted the
    // whole population it names.
    expect(basis).toMatchObject({
      kind: 'snapshot', asOf, status, partial: false, withheldCount: 0,
    });
  });

  it('declares a partly counted population without ageing the value', () => {
    // Coverage and freshness are independent: a count read today stays
    // `current` while saying it left members out.
    expect(buildSnapshotBasis({
      asOf: '2026-09-10',
      requiredAsOf: '2026-09-10',
      sources: ['orders'],
      withheldCount: 2,
    })).toMatchObject({ status: 'current', partial: true, withheldCount: 2 });
  });

  it('explains an absent value by what was withheld without calling it partly counted', () => {
    // An empty measurable subset has no value to be partly counted, so the
    // withheld population is the reason rather than a qualifier.
    expect(buildSnapshotBasis({
      sources: ['orders'],
      measured: false,
      withheldCount: 4,
    })).toMatchObject({ status: 'unavailable', partial: false, withheldCount: 4 });
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
