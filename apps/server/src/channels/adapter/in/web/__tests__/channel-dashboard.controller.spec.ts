import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelDashboardController } from '../channel-dashboard.controller';

const ORGANIZATION_ID = 'organization-1';

function makeController() {
  const service = {
    getRevenueTrend: vi.fn(),
    getProductRanking: vi.fn(),
  };
  return {
    controller: new ChannelDashboardController(service as never),
    service,
  };
}

afterEach(() => vi.useRealTimers());

describe('ChannelDashboardController date ranges', () => {
  it('rejects invalid calendar dates and reversed ranges', async () => {
    const { controller, service } = makeController();

    await expect(controller.getRevenueTrend(
      ORGANIZATION_ID,
      { from: '2026-02-30', to: '2026-03-02' },
    )).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'DATE_INVALID' } });
    await expect(controller.getRevenueTrend(
      ORGANIZATION_ID,
      { from: '2026-03-03', to: '2026-03-02' },
    )).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'DATE_RANGE_INVALID' } });
    expect(service.getRevenueTrend).not.toHaveBeenCalled();
  });

  it('keeps the rolling default when both dates are omitted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T03:00:00.000Z'));
    const { controller, service } = makeController();

    await controller.getRevenueTrend(ORGANIZATION_ID, {});

    expect(service.getRevenueTrend).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      new Date('2026-08-13T15:00:00.000Z'),
      new Date('2026-09-13T15:00:00.000Z'),
    );
  });
});
