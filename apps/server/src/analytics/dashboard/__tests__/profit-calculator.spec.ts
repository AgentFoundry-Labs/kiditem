import { describe, it, expect, vi } from 'vitest';
import { calculateProfitForRange } from '../adapter/out/repository/profit-calculation.repository.adapter';

/**
 * Hard rewrite Phase H3b — `calculateProfitForRange` ad spend now reads
 * `ChannelListingDailySnapshot.aggregate({ _sum: { adSpend, adRevenue, ... } })`.
 * Tests stay focused on R-1 shipping accumulation by stubbing the aggregate
 * to return zero — the order/lineItem path is unchanged.
 */
type PrismaMock = {
  order: { findMany: ReturnType<typeof vi.fn> };
  channelListingDailySnapshot: { aggregate: ReturnType<typeof vi.fn> };
};

function makePrisma(orders: unknown[]): PrismaMock {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    channelListingDailySnapshot: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          adSpend: 0,
          adRevenue: 0,
          adImpressions: 0,
          adClicks: 0,
          adConversions: 0,
        },
      }),
    },
  };
}

describe('calculateProfitForRange — R-1 shipping per-order', () => {
  it('order 1개에 lineItem 3개여도 shipping = order.shippingPrice × 1', async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 10000,
            option: {
              costPrice: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
            },
          },
          {
            quantity: 2,
            totalPrice: 20000,
            option: {
              costPrice: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
            },
          },
          {
            quantity: 1,
            totalPrice: 5000,
            option: {
              costPrice: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
            },
          },
        ],
      },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.shippingCost).toBe(3000); // NOT 999 × 3
  });

  it('order 2개 — shipping = 합산 per-order', async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 10000,
            option: { costPrice: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 },
          },
        ],
      },
      {
        shippingPrice: 2500,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 8000,
            option: { costPrice: 4000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 },
          },
        ],
      },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.shippingCost).toBe(5500);
  });

  it('order with zero lineItems still accumulates shipping (Order.shippingPrice source of truth)', async () => {
    const prisma = makePrisma([
      { shippingPrice: 3000, lineItems: [] },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.shippingCost).toBe(3000);
    expect(result.revenue).toBe(0);
  });

  it('status filter (cancelled/returned/refunded) excludes shipping accumulation via order.findMany where', async () => {
    const findManyMock = vi.fn().mockResolvedValue([
      { shippingPrice: 3000, lineItems: [{ quantity: 1, totalPrice: 10000, option: { costPrice: 5000, commissionRate: 0.1, otherCost: 0 } }] },
    ]);
    const prisma = {
      order: { findMany: findManyMock },
      channelListingDailySnapshot: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            adSpend: 0,
            adRevenue: 0,
            adImpressions: 0,
            adClicks: 0,
            adConversions: 0,
          },
        }),
      },
    };
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    await calculateProfitForRange(prisma as any, 'company-1', from, to);
    // The status filter is the service's contract — assert findMany was called with notIn filter
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company-1',
        status: expect.objectContaining({ notIn: expect.arrayContaining(['cancelled', 'returned', 'refunded']) }),
      }),
    }));
  });
});

describe('calculateProfitForRange — daily-fact ad spend aggregation', () => {
  it('aggregates adSpend/adRevenue/adImpressions/adClicks/adConversions from ChannelListingDailySnapshot', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({
      _sum: {
        adSpend: 12345,
        adRevenue: 67890,
        adImpressions: 1000,
        adClicks: 50,
        adConversions: 5,
      },
    });
    const prisma = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingDailySnapshot: { aggregate: aggregateMock },
    };
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);

    expect(aggregateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company-1',
        businessDate: { gte: from, lt: to },
      }),
      _sum: expect.objectContaining({
        adSpend: true,
        adRevenue: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
      }),
    }));
    expect(result.adCost).toBe(12345);
    expect(result.adRevenue).toBe(67890);
    expect(result.adImpressions).toBe(1000);
    expect(result.adClicks).toBe(50);
    expect(result.adConversions).toBe(5);
  });

  it('empty daily-fact aggregate → zero ad metrics, no legacy fallback', async () => {
    const prisma = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingDailySnapshot: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            adSpend: null,
            adRevenue: null,
            adImpressions: null,
            adClicks: null,
            adConversions: null,
          },
        }),
      },
    };
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.adCost).toBe(0);
    expect(result.adRevenue).toBe(0);
    expect(result.adImpressions).toBe(0);
    expect(result.adClicks).toBe(0);
    expect(result.adConversions).toBe(0);
  });
});
