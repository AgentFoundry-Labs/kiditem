import { describe, expect, it } from 'vitest';

const modulePath = './master-product-abc.js';

async function calculator() {
  return import(modulePath);
}

const defaultPolicy = {
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
};

describe('calculateMasterProductAbcGrades', () => {
  it('keeps equal-score evidence in the same grade group', async () => {
    const { calculateMasterProductAbcGrades } = await calculator();
    expect(calculateMasterProductAbcGrades(defaultPolicy, [
      { masterProductId: 'master-c', metricValue: 25, eligible: true },
      { masterProductId: 'master-a', metricValue: 50, eligible: true },
      { masterProductId: 'master-b', metricValue: 25, eligible: true },
    ])).toEqual(new Map([
      ['master-a', 'A'],
      ['master-b', 'A'],
      ['master-c', 'A'],
    ]));
  });

  it('uses configured cumulative thresholds before each score group', async () => {
    const { calculateMasterProductAbcGrades } = await calculator();
    expect(calculateMasterProductAbcGrades(defaultPolicy, [
      { masterProductId: 'master-c', metricValue: 10, eligible: true },
      { masterProductId: 'master-a', metricValue: 70, eligible: true },
      { masterProductId: 'master-b', metricValue: 20, eligible: true },
    ])).toEqual(new Map([
      ['master-a', 'A'],
      ['master-b', 'B'],
      ['master-c', 'C'],
    ]));
  });

  it('keeps ineligible or missing evidence unclassified', async () => {
    const { calculateMasterProductAbcGrades } = await calculator();
    expect(calculateMasterProductAbcGrades(defaultPolicy, [
      { masterProductId: 'ineligible', metricValue: 100, eligible: false },
      { masterProductId: 'missing', metricValue: null, eligible: true },
      { masterProductId: 'ranked', metricValue: 100, eligible: true },
    ])).toEqual(new Map([
      ['ineligible', null],
      ['missing', null],
      ['ranked', 'A'],
    ]));
  });

  it('classifies explicit zero only when a positive cohort exists', async () => {
    const { calculateMasterProductAbcGrades } = await calculator();
    expect(calculateMasterProductAbcGrades(defaultPolicy, [
      { masterProductId: 'positive', metricValue: 1, eligible: true },
      { masterProductId: 'zero', metricValue: 0, eligible: true },
    ])).toEqual(new Map([
      ['positive', 'A'],
      ['zero', 'C'],
    ]));
  });

  it('returns null for an all-zero cohort and stable output regardless of input order', async () => {
    const { calculateMasterProductAbcGrades } = await calculator();
    const rows = [
      { masterProductId: 'master-b', metricValue: 0, eligible: true },
      { masterProductId: 'master-a', metricValue: 0, eligible: true },
    ];
    expect(calculateMasterProductAbcGrades(defaultPolicy, rows)).toEqual(new Map([
      ['master-a', null],
      ['master-b', null],
    ]));
    expect(calculateMasterProductAbcGrades(defaultPolicy, [...rows].reverse()))
      .toEqual(calculateMasterProductAbcGrades(defaultPolicy, rows));
  });
});
