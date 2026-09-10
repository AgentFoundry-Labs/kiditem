import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardContextService } from './dashboard-context.service';

describe('DashboardContextService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an unspecified month on the current KST calendar instead of source-shifting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T16:30:00.000Z')); // 2026-10-01 01:30 KST

    const context = await new DashboardContextService().buildForQuery(
      'organization-id',
      'month',
    );

    expect(context.anchorShifted).toBe(false);
    expect(context.year).toBe(2026);
    expect(context.month).toBe(10);
    expect(context.dateRange.start).toEqual(new Date('2026-09-30T15:00:00.000Z'));
    expect(context.dateRange.end).toEqual(new Date('2026-10-31T15:00:00.000Z'));
  });

  it('preserves explicit custom dates exactly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:00.000Z'));

    const context = await new DashboardContextService().buildForQuery(
      'organization-id',
      'custom',
      '2026-08-25',
      '2026-09-07',
    );

    expect(context.anchorShifted).toBe(false);
    expect(context.dateRange.start).toEqual(new Date('2026-08-24T15:00:00.000Z'));
    expect(context.dateRange.end).toEqual(new Date('2026-09-07T15:00:00.000Z'));
  });

  it('uses the seven closed KST days for week ranges', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z')); // 2026-09-11 01:30 KST

    const context = await new DashboardContextService().buildForQuery(
      'organization-id',
      'week',
    );

    expect(context.dateRange.start).toEqual(new Date('2026-09-03T15:00:00.000Z'));
    expect(context.dateRange.end).toEqual(new Date('2026-09-10T15:00:00.000Z'));
    expect(context.dateRange.prevStart).toEqual(new Date('2026-08-27T15:00:00.000Z'));
    expect(context.dateRange.prevEnd).toEqual(new Date('2026-09-03T15:00:00.000Z'));
  });
});
