import { describe, expect, it, vi } from 'vitest';
import { AdAccountKpiRepositoryAdapter } from '../ad-account-kpi.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function buildAdapter() {
  const readPublished = vi.fn().mockResolvedValue({
    channelAccountId: ACCOUNT_ID,
    rows: [],
  });
  const adapter = new AdAccountKpiRepositoryAdapter({
    $queryRaw: vi.fn(),
  } as never, { readPublished });
  return { adapter, readPublished };
}

describe('AdAccountKpiRepositoryAdapter complete-day range', () => {
  it('reads exactly seven business dates ending yesterday KST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
    try {
      const { adapter, readPublished } = buildAdapter();
      await adapter.findCoupangAdsDaily(ORGANIZATION_ID, '7d');

      expect(readPublished).toHaveBeenCalledWith({
        organizationId: ORGANIZATION_ID,
        from: '2026-07-17',
        to: '2026-07-23',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses an explicit custom date range unchanged', async () => {
    const { adapter, readPublished } = buildAdapter();
    const dateRange = {
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T00:00:00.000Z'),
    };

    await adapter.findCoupangAdsDaily(
      ORGANIZATION_ID,
      'month',
      dateRange,
    );

    expect(readPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('maps the published order count to legacy conversions and orders', async () => {
    const { adapter, readPublished } = buildAdapter();
    readPublished.mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      rows: [
        {
          businessDate: '2026-07-23',
          observedAt: '2026-07-24T00:00:00.000Z',
          normalized: {
            adSpend: 100,
            adRevenue: 900,
            impressions: 2000,
            clicks: 50,
            conversions: 700,
            orders: 7,
            providerRoas: 9,
            providerCtr: 2.5,
            providerConversionRate: 14,
          },
        },
      ],
    });

    await expect(
      adapter.findCoupangAdsDaily(ORGANIZATION_ID, '7d'),
    ).resolves.toEqual([
      {
        businessDate: '2026-07-23',
        sums: {
          spend: 100,
          revenue: 900,
          clicks: 50,
          impressions: 2000,
          conversions: 7,
        },
        orders: 7,
      },
    ]);
  });
});
