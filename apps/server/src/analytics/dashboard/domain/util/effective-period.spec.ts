import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../context';
import {
  buildEffectivePeriod,
  canUseWingRevenue,
  hasOrderEvidence,
  type WingRevenueEvidence,
} from './effective-period';

const NO_PROFIT = { revenue: 0, orderCount: 0 };
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

  /**
   * A short window is not a wrong one. Coupang publishes Wing traffic a day
   * behind its sales, so a month-to-date window is short on almost every day of
   * the month; requiring the whole window blanked the revenue card for the sake
   * of the one day the provider had not published. `coverage` travels with the
   * value and the dashboard reads it as `부분 N/M일`.
   */
  it('accepts a short range and says how short through coverage', () => {
    expect(canUseWingRevenue({
      hasData: true,
      coverage: { targetDays: 7, completedDays: 5 },
    })).toBe(true);
  });

  it('rejects an empty or mismatched range', () => {
    expect(canUseWingRevenue(NO_WING)).toBe(false);
    // Nothing confirmed is the one case with no measured day to publish.
    expect(canUseWingRevenue({
      hasData: true,
      coverage: { targetDays: 7, completedDays: 0 },
    })).toBe(false);
    // A MISMATCH is the owner saying the number is wrong, not that it is short.
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
      { revenue: 250_939_474, orderCount: 361 },
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
      { revenue: 5000, orderCount: 1 },
      COMPLETE_WING,
      NO_ADS,
    );

    expect(period.revenueSource).toBe('mixed');
  });

  // `adSource` selection given already-resolved inputs. Which windows produce
  // those inputs is a database question, answered by
  // `__tests__/effective-period-source-agreement.pg.integration.spec.ts`;
  // this is only the branch rule, so it takes plain values and no mock.
  describe('adSource', () => {
    const ctx = buildDashboardContext(
      'month',
      undefined,
      undefined,
      new Date('2026-07-15T03:00:00.000Z'),
    );
    const adSourceFor = (ads: { hasData: boolean }) =>
      buildEffectivePeriod(ctx, null, NO_PROFIT, NO_WING, ads).adSource;

    it('names no source when the ad ledger has no complete window', () => {
      expect(adSourceFor(NO_ADS)).toBe('none');
    });

    it('names the ad ledger when its window is complete', () => {
      expect(adSourceFor({ hasData: true })).toBe('coupang_ads');
    });
  });
});
