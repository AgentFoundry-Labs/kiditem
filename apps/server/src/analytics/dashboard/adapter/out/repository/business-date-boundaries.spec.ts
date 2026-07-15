import { describe, expect, it, vi } from 'vitest';
import { ProfitCalculationRepositoryAdapter } from './profit-calculation.repository.adapter';
import { RocketRevenueRepositoryAdapter } from './rocket-revenue.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from './wing-traffic-aggregation.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

const JULY_START_KST = new Date('2026-06-30T15:00:00.000Z');
const AUGUST_START_KST = new Date('2026-07-31T15:00:00.000Z');

describe('dashboard business-date boundaries', () => {
  it('queries Wing date facts with UTC-midnight KST calendar keys', async () => {
    const listingAggregate = vi.fn().mockResolvedValue({
      _sum: {},
      _max: { lastObservedAt: null },
      _count: { _all: 0 },
    });
    const accountFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      channelListingDailySnapshot: { aggregate: listingAggregate },
      channelAccountDailyKpiSnapshot: { findMany: accountFindMany },
    } as unknown as PrismaService;

    await new WingTrafficAggregationRepositoryAdapter(prisma).aggregateTraffic(
      'organization-id',
      JULY_START_KST,
      AUGUST_START_KST,
    );

    expect(listingAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    }));
    expect(accountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    }));
  });

  it('queries Rocket date facts with the same normalized month window', async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _sum: {},
      _max: { updatedAt: null },
      _count: { _all: 0 },
    });
    const prisma = {
      rocketSupplyDailySnapshot: { aggregate },
    } as unknown as PrismaService;

    await new RocketRevenueRepositoryAdapter(prisma).aggregateRevenue(
      'organization-id',
      JULY_START_KST,
      AUGUST_START_KST,
    );

    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    }));
  });

  it('keeps KST timestamp bounds for orders but normalizes daily ad facts', async () => {
    const orderFindMany = vi.fn().mockResolvedValue([]);
    const listingAggregate = vi.fn().mockResolvedValue({ _sum: {} });
    const prisma = {
      order: { findMany: orderFindMany },
      channelListingDailySnapshot: { aggregate: listingAggregate },
    } as unknown as PrismaService;

    await new ProfitCalculationRepositoryAdapter(prisma).calculateForRange(
      'organization-id',
      JULY_START_KST,
      AUGUST_START_KST,
    );

    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orderedAt: { gte: JULY_START_KST, lt: AUGUST_START_KST },
      }),
    }));
    expect(listingAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    }));
  });
});
