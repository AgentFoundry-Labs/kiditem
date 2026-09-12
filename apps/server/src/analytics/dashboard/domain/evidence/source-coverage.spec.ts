import { describe, expect, it } from 'vitest';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import {
  adEvidenceApplies,
  adEvidenceDates,
  intersectEvidence,
  metricBasisMap,
  periodEvidence,
  windowCoverageDates,
  type ProfitCoverageEvidence,
} from './source-coverage';

const REQUESTED = ['2026-09-01', '2026-09-02', '2026-09-03'];

function coverage(overrides: Partial<ProfitCoverageEvidence> = {}): ProfitCoverageEvidence {
  return {
    requestedDates: REQUESTED,
    orderDates: REQUESTED,
    adDates: REQUESTED,
    hasAdAccount: true,
    ...overrides,
  };
}

describe('profit source coverage', () => {
  // `adDates.length` cannot tell an account that published nothing from an
  // organization with no account; `hasAdAccount` can.
  it.each([
    ['an account that published every date', true, REQUESTED, true, REQUESTED],
    ['an account that published nothing', true, [], true, []],
    ['no advertising account', false, [], false, REQUESTED],
  ])('reads %s', (_name, hasAdAccount, adDates, applies, dates) => {
    const value = coverage({ hasAdAccount, adDates });
    expect(adEvidenceApplies(value)).toBe(applies);
    expect(adEvidenceDates(value)).toEqual(dates);
  });
});

describe('windowCoverageDates', () => {
  it.each([
    ['an uncollected source covers nothing', false, null, []],
    ['a collected source without coverage detail covers the selection', true, null, REQUESTED],
  ])('%s', (_name, collected, detail, expected) => {
    expect(windowCoverageDates(REQUESTED, detail, collected)).toEqual(expected);
  });

  it('removes the dates the owner reported missing', () => {
    expect(windowCoverageDates(
      REQUESTED,
      { targetDays: 3, completedDays: 1, missingDates: ['2026-09-01', '2026-09-03'] },
      true,
    )).toEqual(['2026-09-02']);
  });
});

describe('evidence lifting over an empty selection', () => {
  const basis = periodEvidence({
    selectedDates: REQUESTED,
    includedDates: REQUESTED,
    sources: ['orders'],
  });

  it('describes a selected period', () => {
    expect(basis).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-03',
      sources: ['orders'],
    });
    expect(basis && periodBasisStatus(basis)).toBe('complete');
  });

  it('has no basis to describe when the window selected no date', () => {
    // A clipped or degenerate window has no calendar range; publishing one
    // would put a non-date into the wire contract.
    expect(periodEvidence({ selectedDates: [], sources: ['orders'] })).toBeNull();
    expect(intersectEvidence(basis, null)).toBeNull();
  });

  it('intersects present bases', () => {
    const ads = periodEvidence({
      selectedDates: REQUESTED,
      includedDates: ['2026-09-02', '2026-09-03'],
      sources: ['coupang_ads'],
    });
    expect(intersectEvidence(basis, ads)).toMatchObject({
      includedDates: ['2026-09-02', '2026-09-03'],
      sources: ['orders', 'coupang_ads'],
    });
  });
});

describe('metricBasisMap', () => {
  const basis = periodEvidence({ selectedDates: REQUESTED, sources: ['orders'] });

  it('drops metrics with no describable basis', () => {
    expect(metricBasisMap({ 'rangeKpi.revenue': basis, 'rangeKpi.profit': null }))
      .toEqual({ 'rangeKpi.revenue': basis });
  });

  it('omits the optional field entirely rather than publishing an empty map', () => {
    expect(metricBasisMap({ 'rangeKpi.revenue': null })).toBeUndefined();
  });
});
