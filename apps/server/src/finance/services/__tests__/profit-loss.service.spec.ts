import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfitLossService } from '../profit-loss.service';

// Hard rewrite Phase H3a/H3b — service composes:
//   order.findMany + orderReturnLineItem.findMany +
//   channelListingDailySnapshot.groupBy(['listingId'], _sum.adSpend)
// `adRows` shape uses `_sum.adSpend` (daily-fact additive ad column),
// not legacy `ad.groupBy._sum.spend`.
function makePrisma(
  orders: unknown[],
  opts: { returnLineItems?: unknown[]; adRows?: unknown[] } = {},
) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    orderReturnLineItem: { findMany: vi.fn().mockResolvedValue(opts.returnLineItems ?? []) },
    channelListingDailySnapshot: {
      groupBy: vi.fn().mockResolvedValue(opts.adRows ?? []),
    },
  } as any;
}

// v2 canonical lineItem shape — option (pricing) + listingOption.listing (identity/master)
const mkLineItem = (listing: {
  id: string; externalId: string; channelName: string | null;
  master: { id: string; code: string; legacyCode: string | null; name: string; category: string | null; abcGrade: string | null; thumbnailUrl: string | null };
}, pricing: { quantity: number; totalPrice: number; costPrice: number; commissionRate: number; otherCost: number }) => ({
  quantity: pricing.quantity,
  totalPrice: pricing.totalPrice,
  option: {
    costPrice: pricing.costPrice,
    commissionRate: pricing.commissionRate,
    otherCost: pricing.otherCost,
  },
  listingOption: { listing },
});

describe('ProfitLossService.findAll (live aggregation)', () => {
  it('IDOR — findMany called with companyId filter + grouping returns only that company rows', async () => {
    const l1 = { id: 'listing-a1', externalId: 'ext-a1', channelName: 'coupang', master: { id: 'master-a1', code: 'MA1', legacyCode: null, name: 'ProductA1', category: 'kids', abcGrade: 'A', thumbnailUrl: null } };
    const l2 = { id: 'listing-a2', externalId: 'ext-a2', channelName: 'coupang', master: { id: 'master-a2', code: 'MA2', legacyCode: 'LEG-A2', name: 'ProductA2', category: 'baby', abcGrade: 'B', thumbnailUrl: 'https://x.com/a2.jpg' } };
    const orders = [
      { id: 'oA1', shippingPrice: 3000, lineItems: [mkLineItem(l1, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.108, otherCost: 0 })] },
      { id: 'oA2', shippingPrice: 3000, lineItems: [mkLineItem(l2, { quantity: 2, totalPrice: 20000, costPrice: 4000, commissionRate: 0.1, otherCost: 100 })] },
      { id: 'oA3', shippingPrice: 3000, lineItems: [mkLineItem(l2, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 })] },
    ];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
    expect(result).toHaveLength(2);
    expect(result.map(r => r.listingId).sort()).toEqual(['listing-a1', 'listing-a2']);
  });

  it('shipping revenue-weighted — single listing gets full order shipping', async () => {
    const l1 = { id: 'listing-1', externalId: 'ext-1', channelName: 'coupang', master: { id: 'master-1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{
      id: 'o1',
      shippingPrice: 3000,
      lineItems: [
        mkLineItem(l1, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(l1, { quantity: 2, totalPrice: 20000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
      ],
    }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(result).toHaveLength(1);
    expect(result[0].shippingCost).toBe(3000);
  });

  it('shipping revenue-weighted — split across 2 listings by lineItem revenue ratio', async () => {
    const la = { id: 'la', externalId: 'exA', channelName: 'coupang', master: { id: 'ma', code: 'MA', legacyCode: null, name: 'A', category: null, abcGrade: null, thumbnailUrl: null } };
    const lb = { id: 'lb', externalId: 'exB', channelName: 'coupang', master: { id: 'mb', code: 'MB', legacyCode: null, name: 'B', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{
      id: 'o1',
      shippingPrice: 3000,
      lineItems: [
        mkLineItem(la, { quantity: 1, totalPrice: 9000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(lb, { quantity: 1, totalPrice: 3000, costPrice: 2000, commissionRate: 0.1, otherCost: 0 }),
      ],
    }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    const a = result.find(r => r.listingId === 'la')!;
    const b = result.find(r => r.listingId === 'lb')!;
    expect(a.shippingCost).toBe(Math.round(3000 * 9000 / 12000));
    expect(b.shippingCost).toBe(Math.round(3000 * 3000 / 12000));
    expect(a.shippingCost + b.shippingCost).toBe(3000);
  });

  it('PLData shape — satisfies schema fields (listingId/masterName/legacyCode fallback/netProfit)', async () => {
    const l = { id: 'l1', externalId: 'ext-1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: 'LEG-1', name: 'Product1', category: 'kids', abcGrade: 'A', thumbnailUrl: 'https://x.com/1.jpg' } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.108, otherCost: 0 })] }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row).toMatchObject({
      listingId: 'l1',
      externalId: 'ext-1',
      channelName: 'coupang',
      masterId: 'm1',
      masterCode: 'LEG-1',
      masterName: 'Product1',
      category: 'kids',
      grade: 'A',
      thumbnailUrl: 'https://x.com/1.jpg',
      revenue: 10000,
      cogs: 5000,
      shippingCost: 3000,
      otherCost: 0,
    });
    expect(row.commission).toBeCloseTo(1080, 0);
    expect(row.netProfit).toBe(10000 - 5000 - row.commission - 3000 - 0 - 0);
    expect(row.orderCount).toBe(1);
  });

  it('empty orders → empty array', async () => {
    const prisma = makePrisma([]);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(result).toEqual([]);
  });

  it('empty orderReturnLineItem + empty ad rows → returnCount/adCost fallback 0', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    const prisma = makePrisma(orders, { returnLineItems: [], adRows: [] });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.returnCount).toBe(0);
    expect(row.adCost).toBe(0);
  });

  it('orderCount = distinct order count per listing (same listing across 3 orders → 3)', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [
      { id: 'order-1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'order-2', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 20000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'order-3', shippingPrice: 3000, lineItems: [
        mkLineItem(l, { quantity: 1, totalPrice: 5000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(l, { quantity: 2, totalPrice: 7000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.orderCount).toBe(3);
  });

  it('returnCount aggregated from orderReturnLineItem.findMany → listingId via orderLineItem.listingOption', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    const returnLineItems = [
      { orderLineItem: { listingOption: { listingId: 'l1' } } },
      { orderLineItem: { listingOption: { listingId: 'l1' } } },
      { orderLineItem: null },
    ];
    const prisma = makePrisma(orders, { returnLineItems });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.returnCount).toBe(2);
    expect(prisma.orderReturnLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'companyA',
        return: expect.objectContaining({
          requestedAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    }));
  });

  it('adCost aggregated from channelListingDailySnapshot.groupBy by listingId with companyId filter', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    const adRows = [{ listingId: 'l1', _sum: { adSpend: 1500 } }];
    const prisma = makePrisma(orders, { adRows });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.adCost).toBe(1500);
    expect(row.netProfit).toBe(10000 - 5000 - 1000 - 3000 - 1500 - 0);
    expect(prisma.channelListingDailySnapshot.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['listingId'],
      _sum: { adSpend: true },
      where: expect.objectContaining({
        companyId: 'companyA',
        businessDate: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
    }));
  });
});
