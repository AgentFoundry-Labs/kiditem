import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { ProfitCalculationRepositoryAdapter } from './profit-calculation.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from './wing-traffic-aggregation.repository.adapter';
import { periodOf } from '../../../__tests__/test-helpers/period';

const JULY_START_KST = new Date('2026-06-30T15:00:00.000Z');
const AUGUST_START_KST = new Date('2026-07-31T15:00:00.000Z');

describe('dashboard business-date boundaries', () => {
  it('queries Wing date facts with UTC-midnight KST calendar keys', async () => {
    const readPublished = vi.fn().mockResolvedValue({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      attemptId: '22222222-2222-4222-8222-222222222222',
      plan: {
        sourceType: 'coupang_wing_traffic',
        parserVersion: 'wing-traffic-v1',
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        expectedAdvertiserId: 'VENDOR-A',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        businessDate: '2026-07-01',
        periodDays: 31,
        targetUrl: null,
      },
      rows: [],
      dashboard: null,
    });

    await new WingTrafficAggregationRepositoryAdapter(
      { readPublished },
      { readPublished: vi.fn() },
    ).aggregateTraffic('organization-id', periodOf(JULY_START_KST, AUGUST_START_KST));

    expect(readPublished).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('keeps KST timestamp bounds for orders but normalizes daily ad facts', async () => {
    const orderFindMany = vi.fn().mockResolvedValue([]);
    const readPublished = vi.fn().mockResolvedValue({ rows: [] });
    const prisma = {
      order: { findMany: orderFindMany },
    } as unknown as PrismaService;

    await new ProfitCalculationRepositoryAdapter(prisma, { readPublished }).calculateForRange('organization-id', periodOf(JULY_START_KST, AUGUST_START_KST));

    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orderedAt: { gte: JULY_START_KST, lt: AUGUST_START_KST },
      }),
    }));
    expect(readPublished).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });
});
