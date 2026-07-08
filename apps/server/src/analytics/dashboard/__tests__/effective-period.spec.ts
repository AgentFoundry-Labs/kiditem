import { describe, expect, it } from 'vitest';
import { buildDashboardContext } from '../domain/context';
import { buildEffectivePeriod } from '../domain/util/effective-period';

const emptyProfit = { revenue: 0, adCost: 0, orderCount: 0 };
const emptyWing = { hasData: false };
const emptyAds = { hasData: false };

describe('buildEffectivePeriod', () => {
  it('marks Rocket-only revenue as the revenue source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));
    const result = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      emptyProfit,
      emptyWing,
      emptyAds,
      { revenue: 250_939_474, poCount: 361, itemQty: 43_803, hasData: true },
    );

    expect(result).toMatchObject({
      year: 2026,
      month: 6,
      latestDataDate: '2026-06-26',
      revenueSource: 'rocket',
    });
  });

  it('marks Wing and Rocket revenue as a combined source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));
    const result = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      emptyProfit,
      { hasData: true },
      emptyAds,
      { revenue: 10_000, poCount: 1, itemQty: 2, hasData: true },
    );

    expect(result.revenueSource).toBe('wing_rocket');
  });
});
