import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../context';
import {
  buildEffectivePeriod,
  canUseWingRevenue,
  hasOrderEvidence,
  type WingRevenueEvidence,
} from './effective-period';

const NO_PROFIT = { revenue: 0, adCost: 0, orderCount: 0 };
const NO_WING: WingRevenueEvidence = { hasData: false };
const NO_ADS = { hasData: false };

/** A complete, reconciled Wing account range. */
const COMPLETE_WING: WingRevenueEvidence = {
  hasData: true,
  coverage: { targetDays: 7, completedDays: 7 },
  reconciliation: { revenue: { status: 'MATCHED' } },
};

describe('hasOrderEvidence', () => {
  it('accepts revenue or an order row', () => {
    expect(hasOrderEvidence({ revenue: 5_000, orderCount: 0 })).toBe(true);
    expect(hasOrderEvidence({ revenue: 0, orderCount: 3 })).toBe(true);
  });

  it('treats an empty window as no evidence', () => {
    expect(hasOrderEvidence({ revenue: 0, orderCount: 0 })).toBe(false);
    expect(hasOrderEvidence({ revenue: 0 })).toBe(false);
  });
});

describe('canUseWingRevenue', () => {
  it('accepts a complete, reconciled account range', () => {
    expect(canUseWingRevenue(COMPLETE_WING)).toBe(true);
    expect(canUseWingRevenue({ hasData: true })).toBe(true);
  });

  it('rejects an incomplete or mismatched range', () => {
    expect(canUseWingRevenue(NO_WING)).toBe(false);
    expect(canUseWingRevenue({
      hasData: true,
      coverage: { targetDays: 7, completedDays: 5 },
    })).toBe(false);
    expect(canUseWingRevenue({
      hasData: true,
      reconciliation: { revenue: { status: 'MISMATCH' } },
    })).toBe(false);
  });
});

describe('buildEffectivePeriod', () => {
  it('ignores the retired Rocket argument and reports only selected Order/Wing sources', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = (buildEffectivePeriod as (...args: unknown[]) => ReturnType<typeof buildEffectivePeriod>)(
      ctx,
      null,
      NO_PROFIT,
      NO_WING,
      NO_ADS,
      { revenue: 5000, hasData: true },
    );

    expect(period.revenueSource).toBe('none');
    expect(period.label).toBe('2026-07');
  });

  it('marks Order revenue as the selected source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));

    const period = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      { revenue: 250_939_474, adCost: 0, orderCount: 361 },
      NO_WING,
      NO_ADS,
    );

    expect(period).toMatchObject({
      year: 2026,
      month: 6,
      latestDataDate: '2026-06-26',
      revenueSource: 'orders',
    });
  });

  it('marks Wing revenue as the fallback source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));

    const period = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      NO_PROFIT,
      COMPLETE_WING,
      NO_ADS,
    );

    expect(period.revenueSource).toBe('wing');
  });

  it('reports mixed when selected Order and Wing revenue both have evidence', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = buildEffectivePeriod(
      ctx,
      null,
      { revenue: 5000, adCost: 0, orderCount: 1 },
      COMPLETE_WING,
      NO_ADS,
    );

    expect(period.revenueSource).toBe('mixed');
  });
});
