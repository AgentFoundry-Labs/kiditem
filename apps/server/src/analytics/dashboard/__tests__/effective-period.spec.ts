import { describe, expect, it } from 'vitest';
import { buildDashboardContext } from '../domain/context';
import { buildEffectivePeriod } from '../domain/util/effective-period';

const emptyProfit = { revenue: 0, adCost: 0, orderCount: 0 };
const emptyWing = { hasData: false };
const emptyAds = { hasData: false };

describe('buildEffectivePeriod', () => {
  it('marks Order revenue as the selected source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));
    const result = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      { revenue: 250_939_474, adCost: 0, orderCount: 361 },
      emptyWing,
      emptyAds,
    );

    expect(result).toMatchObject({
      year: 2026,
      month: 6,
      latestDataDate: '2026-06-26',
      revenueSource: 'orders',
    });
  });

  it('marks Wing revenue as the fallback source', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date(2026, 5, 26, 12));
    const result = buildEffectivePeriod(
      ctx,
      new Date('2026-06-26T00:00:00.000Z'),
      emptyProfit,
      { hasData: true },
      emptyAds,
    );

    expect(result.revenueSource).toBe('wing');
  });
});
