import { describe, it, expect, vi } from 'vitest';
import { calculateProfitForRange } from '../helpers/profit-calculator';

type PrismaMock = {
  order: { findMany: ReturnType<typeof vi.fn> };
  adSnapshot: { aggregate: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  ad: { aggregate: ReturnType<typeof vi.fn> };
};

function makePrisma(orders: unknown[]): PrismaMock {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    adSnapshot: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 },
        // `_max.capturedAt: null` causes the AdSnapshot pro-rating branch to be skipped,
        // isolating these tests to R-1 shipping assertion. If a future test needs to
        // exercise the ad branch, override this mock per-test.
        _max: { capturedAt: null },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ad: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
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
      adSnapshot: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 }, _max: { capturedAt: null } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      ad: { aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0 } }) },
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
