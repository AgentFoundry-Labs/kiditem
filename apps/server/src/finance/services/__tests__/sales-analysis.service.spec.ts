import { describe, it, expect, vi } from 'vitest';
import { SalesAnalysisService } from '../sales-analysis.service';

// Hard rewrite Phase H3b — service now sources per-listing ad spend from
// `ChannelListingDailySnapshot.groupBy` (additive `_sum.adSpend`) instead of
// legacy `Ad.groupBy._sum.spend`.
function makePrisma(overrides: {
  orders?: unknown[];
  returnRows?: unknown[];
  adGroupRows?: unknown[];
  orphanCount?: number;
  listings?: Array<{ id: string; channel: string }>;
}) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(overrides.orders ?? []) },
    orderReturnLineItem: { findMany: vi.fn().mockResolvedValue(overrides.returnRows ?? []) },
    channelListingDailySnapshot: {
      groupBy: vi.fn().mockResolvedValue(overrides.adGroupRows ?? []),
    },
    orderReturn: { count: vi.fn().mockResolvedValue(overrides.orphanCount ?? 0) },
    channelListing: { findMany: vi.fn().mockResolvedValue(overrides.listings ?? []) },
  } as any;
}

const mkLineItem = (
  listing: { id: string; channel: string },
  p: { quantity: number; totalPrice: number; costPrice: number; commissionRate: number; otherCost: number },
) => ({
  quantity: p.quantity,
  totalPrice: p.totalPrice,
  option: {
    costPrice: p.costPrice,
    commissionRate: p.commissionRate,
    otherCost: p.otherCost,
  },
  listingOption: { listing },
});

describe('SalesAnalysisService.getAnalysis — Plan D.3', () => {
  it('groups by channel (not channelName)', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'o2', shippingPrice: 3000, lineItems: [mkLineItem(naver, { quantity: 2, totalPrice: 20000, costPrice: 4000, commissionRate: 0.15, otherCost: 100 })] },
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.channels.map((c) => c.channel).sort()).toEqual(['coupang', 'naver']);
    expect(result.channels[0].channelType).toBe('marketplace');
  });

  it('channelType derivation — wing → direct, unknown → other', async () => {
    const wing = { id: 'l-w', channel: 'wing' };
    const weird = { id: 'l-x', channel: 'unknown-ch' };
    const orders = [
      { id: 'o1', shippingPrice: 0, lineItems: [mkLineItem(wing, { quantity: 1, totalPrice: 1000, costPrice: 500, commissionRate: 0, otherCost: 0 })] },
      { id: 'o2', shippingPrice: 0, lineItems: [mkLineItem(weird, { quantity: 1, totalPrice: 1000, costPrice: 500, commissionRate: 0, otherCost: 0 })] },
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const w = result.channels.find((c) => c.channel === 'wing')!;
    const x = result.channels.find((c) => c.channel === 'unknown-ch')!;
    expect(w.channelType).toBe('direct');
    expect(x.channelType).toBe('other');
  });

  it('IDOR — 3-hop organizationId on return query + channelListing lookup', async () => {
    const prisma = makePrisma({});
    await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'cA' }),
    }));
    expect(prisma.orderReturnLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'cA',
        return: expect.objectContaining({
          organizationId: 'cA',
          order: expect.objectContaining({
            organizationId: 'cA',
            orderedAt: expect.any(Object),
            status: expect.any(Object),   // ← verify status filter mirror
          }),
        }),
      }),
    }));
  });

  it('returnRate distinct-order count — 1 order × 2 returned lineItems = returnRate 1.0, NOT 2.0', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(coup, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    // 2 lineItem returns, SAME order → returnCount = 1 (distinct orderId)
    const returnRows = [
      { orderLineItem: { order: { id: 'o1' }, listingOption: { listing: { channel: 'coupang' } } } },
      { orderLineItem: { order: { id: 'o1' }, listingOption: { listing: { channel: 'coupang' } } } },
    ];
    const prisma = makePrisma({ orders, returnRows });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels[0];
    expect(c.totalOrders).toBe(1);
    expect(c.returnCount).toBe(1);
    expect(c.returnRate).toBe(1);
  });

  it('returnRate = 0 when totalOrders = 0 (no division by zero)', async () => {
    const prisma = makePrisma({});
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.channels).toEqual([]);
    expect(result.totals.totalOrders).toBe(0);
  });

  it('channelListingDailySnapshot.groupBy by listingId → channel via channelListing lookup', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
    ];
    const adGroupRows = [
      { listingId: 'l-c', _sum: { adSpend: 2000 } },
      { listingId: 'l-unknown', _sum: { adSpend: 500 } },  // not in listings → dropped
    ];
    const listings = [{ id: 'l-c', channel: 'coupang' }];  // only l-c resolves
    const prisma = makePrisma({ orders, adGroupRows, listings });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels[0];
    expect(c.totalCost).toBeGreaterThanOrEqual(2000);  // adCost absorbed
    expect(prisma.channelListingDailySnapshot.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['listingId'],
      _sum: { adSpend: true },
      where: expect.objectContaining({
        organizationId: 'cA',
        businessDate: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
    }));
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'cA' }),
    }));
  });

  it('orphanReturnCount exposed at totals, not per-channel', async () => {
    const prisma = makePrisma({ orphanCount: 5 });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.totals.orphanReturnCount).toBe(5);
  });

  it('totals.totalOrders = global distinct (avoids multi-channel dup)', async () => {
    // Order o1 spans coupang + naver lineItems — single distinct global order, 1 in each channel's count
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(naver, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    expect(result.channels.find((c) => c.channel === 'coupang')!.totalOrders).toBe(1);
    expect(result.channels.find((c) => c.channel === 'naver')!.totalOrders).toBe(1);
    expect(result.totals.totalOrders).toBe(1);
  });

  it('period default + invalid → current month', async () => {
    const prisma = makePrisma({});
    const [r1, r2] = await Promise.all([
      new SalesAnalysisService(prisma).getAnalysis('cA'),
      new SalesAnalysisService(prisma).getAnalysis('cA', 'garbage'),
    ]);
    expect(r1.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(r2.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('revenue-weighted shipping across channels preserves total shipping invariant', async () => {
    const coup = { id: 'l-c', channel: 'coupang' };
    const naver = { id: 'l-n', channel: 'naver' };
    const orders = [
      { id: 'o1', shippingPrice: 3000, lineItems: [
        mkLineItem(coup, { quantity: 1, totalPrice: 9000, costPrice: 5000, commissionRate: 0, otherCost: 0 }),
        mkLineItem(naver, { quantity: 1, totalPrice: 3000, costPrice: 2000, commissionRate: 0, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma({ orders });
    const result = await new SalesAnalysisService(prisma).getAnalysis('cA', '2026-04');
    const c = result.channels.find((x) => x.channel === 'coupang')!;
    const n = result.channels.find((x) => x.channel === 'naver')!;
    // Revenue
    expect(c.totalRevenue).toBe(9000);
    expect(n.totalRevenue).toBe(3000);
    // totalCost = cogs + commission + shipping + ad + other
    //  coupang: 5000 + 0 + 2250 + 0 + 0 = 7250 → shipping share = 2250
    //  naver:   2000 + 0 + 750  + 0 + 0 = 2750 → shipping share = 750
    //  Sum of shipping shares = 2250 + 750 = 3000 (= order.shippingPrice) ✓ invariant
    expect(c.totalCost).toBe(7250);
    expect(n.totalCost).toBe(2750);
    // Derive shipping share from totalCost: share = totalCost - cogs - commission - otherCost - adCost
    const coupangShipping = c.totalCost - 5000 - 0 - 0 - 0;
    const naverShipping = n.totalCost - 2000 - 0 - 0 - 0;
    expect(coupangShipping + naverShipping).toBe(3000);  // revenue-weighted invariant
  });
});
