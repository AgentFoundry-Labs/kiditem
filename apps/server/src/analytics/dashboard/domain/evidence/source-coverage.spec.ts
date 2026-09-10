import { describe, expect, it } from 'vitest';
import {
  adEvidenceApplies,
  adEvidenceDates,
  comparisonEvidence,
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
    adEvidence: 'OBSERVED',
    ...overrides,
  };
}

describe('profit source coverage', () => {
  // `adDates.length` cannot tell these two apart; `adEvidence` can.
  it.each([
    ['OBSERVED', true, REQUESTED],
    ['CONFIRMED_ZERO', true, REQUESTED],
    ['MISSING', true, []],
    ['NOT_APPLIED', false, REQUESTED],
  ])('reads %s as applies=%s', (adEvidence, applies, dates) => {
    const value = coverage({
      adEvidence,
      adDates: adEvidence === 'OBSERVED' || adEvidence === 'CONFIRMED_ZERO' ? REQUESTED : [],
    });
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
      status: 'complete',
      sources: ['orders'],
    });
  });

  it('has no basis to describe when the window selected no date', () => {
    // A clipped or degenerate window has no calendar range; publishing one
    // would put a non-date into the wire contract.
    expect(periodEvidence({ selectedDates: [], sources: ['orders'] })).toBeNull();
    expect(intersectEvidence(basis, null)).toBeNull();
    expect(comparisonEvidence(basis, null)).toBeNull();
    expect(comparisonEvidence(null, basis)).toBeNull();
  });

  it('intersects and compares present bases', () => {
    const ads = periodEvidence({
      selectedDates: REQUESTED,
      includedDates: ['2026-09-02', '2026-09-03'],
      sources: ['coupang_ads'],
    });
    expect(intersectEvidence(basis, ads)).toMatchObject({
      includedDates: ['2026-09-02', '2026-09-03'],
      sources: ['orders', 'coupang_ads'],
    });
    expect(comparisonEvidence(basis, basis)).toMatchObject({
      kind: 'comparison',
      status: 'comparable',
      matchedOffsets: [0, 1, 2],
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
