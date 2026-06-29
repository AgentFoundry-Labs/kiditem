import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../context';
import { buildEffectivePeriod } from './effective-period';

describe('buildEffectivePeriod', () => {
  it('reports rocket-only revenue periods separately from order and Wing sources', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = buildEffectivePeriod(
      ctx,
      null,
      { revenue: 0, adCost: 0, orderCount: 0 },
      { hasData: false },
      { hasData: false },
      { revenue: 5000, hasData: true },
    );

    expect(period.revenueSource).toBe('rocket');
    expect(period.label).toBe('2026-07');
  });

  it('reports Wing plus Rocket when no order-settlement revenue exists', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = buildEffectivePeriod(
      ctx,
      null,
      { revenue: 0, adCost: 0, orderCount: 0 },
      { hasData: true },
      { hasData: false },
      { revenue: 5000, hasData: true },
    );

    expect(period.revenueSource).toBe('wing_rocket');
  });
});
