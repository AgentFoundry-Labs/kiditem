import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../context';
import { buildEffectivePeriod } from './effective-period';

describe('buildEffectivePeriod', () => {
  it('ignores the retired Rocket argument and reports only selected Order/Wing sources', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = (buildEffectivePeriod as (...args: unknown[]) => ReturnType<typeof buildEffectivePeriod>)(
      ctx,
      null,
      { revenue: 0, adCost: 0, orderCount: 0 },
      { hasData: false },
      { hasData: false },
      { revenue: 5000, hasData: true },
    );

    expect(period.revenueSource).toBe('none');
    expect(period.label).toBe('2026-07');
  });

  it('reports mixed when selected Order and Wing revenue both have evidence', () => {
    const ctx = buildDashboardContext('month', undefined, undefined, new Date('2026-07-01T00:00:00.000Z'));

    const period = buildEffectivePeriod(
      ctx,
      null,
      { revenue: 5000, adCost: 0, orderCount: 1 },
      { hasData: true },
      { hasData: false },
    );

    expect(period.revenueSource).toBe('mixed');
  });
});
