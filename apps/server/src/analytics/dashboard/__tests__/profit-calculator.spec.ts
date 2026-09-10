import { describe, it, expect, vi } from 'vitest';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Ad spend is supplied by the Advertising owner publication port. Tests keep
 * the order/lineItem path focused while providing explicit owner rows where
 * ad evidence is part of the assertion.
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

function makeAdapter(
  prisma: PrismaMock,
  rows: unknown[] = [],
): ProfitCalculationRepositoryAdapter {
  return new ProfitCalculationRepositoryAdapter(
    prisma as unknown as PrismaService,
    {
      readPublished: vi.fn().mockResolvedValue({
        channelAccountId: '00000000-0000-4000-8000-000000000001',
        rows,
      }),
    },
  );
}

function ownerRow(
  businessDate: string,
  values: Partial<{
    adSpend: number;
    adRevenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }> = {},
) {
  return {
    businessDate,
    observedAt: `${businessDate}T23:00:00.000Z`,
    normalized: {
      adSpend: values.adSpend ?? 0,
      adRevenue: values.adRevenue ?? 0,
      impressions: values.impressions ?? 0,
      clicks: values.clicks ?? 0,
      conversions: values.conversions ?? 0,
      orders: 0,
      providerRoas: null,
      providerCtr: null,
      providerConversionRate: null,
    },
  };
}

describe('ProfitCalculationRepositoryAdapter.calculateForRange — R-1 shipping per-order', () => {
  it('order 1개에 lineItem 3개여도 shipping = order.shippingPrice × 1', async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 10000,
            listingOption: {
              costPriceOverride: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
              inventoryComponents: [],
            },
          },
          {
            quantity: 2,
            totalPrice: 20000,
            listingOption: {
              costPriceOverride: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
              inventoryComponents: [],
            },
          },
          {
            quantity: 1,
            totalPrice: 5000,
            listingOption: {
              costPriceOverride: 5000,
              commissionRate: 0.1,
              shippingCost: 999,
              otherCost: 0,
              inventoryComponents: [],
            },
          },
        ],
      },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await makeAdapter(prisma).calculateForRange('organization-1', from, to);
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
            listingOption: { costPriceOverride: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0, inventoryComponents: [] },
          },
        ],
      },
      {
        shippingPrice: 2500,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 8000,
            listingOption: { costPriceOverride: 4000, commissionRate: 0.1, shippingCost: 999, otherCost: 0, inventoryComponents: [] },
          },
        ],
      },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await makeAdapter(prisma).calculateForRange('organization-1', from, to);
    expect(result.shippingCost).toBe(5500);
  });

  it('order with zero lineItems still accumulates shipping (Order.shippingPrice source of truth)', async () => {
    const prisma = makePrisma([
      { shippingPrice: 3000, lineItems: [] },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await makeAdapter(prisma).calculateForRange('organization-1', from, to);
    expect(result.shippingCost).toBe(3000);
    expect(result.revenue).toBe(0);
  });

  it('falls back to listing-option shipping only when imported order shipping is absent', async () => {
    const prisma = makePrisma([
      {
        // Channel order ingestion stores a missing provider shipping value as 0.
        shippingPrice: 0,
        lineItems: [
          {
            quantity: 2,
            totalPrice: 20000,
            listingOption: {
              costPriceOverride: 5000,
              commissionRate: 0.1,
              shippingCost: 3000,
              otherCost: 0,
              inventoryComponents: [],
            },
          },
        ],
      },
    ]);

    const result = await makeAdapter(prisma).calculateForRange(
      'organization-1',
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-05-01T00:00:00Z'),
    );

    expect(result.shippingCost).toBe(6000);
  });

  it('status filter (cancelled/returned/refunded) excludes shipping accumulation via order.findMany where', async () => {
    const findManyMock = vi.fn().mockResolvedValue([
      { shippingPrice: 3000, lineItems: [{ quantity: 1, totalPrice: 10000, listingOption: { costPriceOverride: 5000, commissionRate: 0.1, otherCost: 0, inventoryComponents: [] } }] },
    ]);
    const prisma: PrismaMock = {
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
    await makeAdapter(prisma).calculateForRange('organization-1', from, to);
    // The status filter is the service's contract — assert findMany was called with notIn filter
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        status: expect.objectContaining({ notIn: expect.arrayContaining(['cancelled', 'returned', 'refunded']) }),
      }),
    }));
  });
});

describe('ProfitCalculationRepositoryAdapter.calculateForRange — owner-published ad evidence', () => {
  it('aggregates additive ad metrics from Advertising owner rows', async () => {
    const prisma: PrismaMock = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingDailySnapshot: { aggregate: vi.fn() },
    };
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await makeAdapter(prisma, [ownerRow('2026-04-01', {
      adSpend: 12345,
      adRevenue: 67890,
      impressions: 1000,
      clicks: 50,
      conversions: 5,
    })]).calculateForRange('organization-1', from, to);

    expect(result.adCost).toBe(12345);
    expect(result.adRevenue).toBe(67890);
    expect(result.adImpressions).toBe(1000);
    expect(result.adClicks).toBe(50);
    expect(result.adConversions).toBe(5);
  });

  it('empty owner publication → zero ad metrics and incomplete ad evidence', async () => {
    const prisma: PrismaMock = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingDailySnapshot: { aggregate: vi.fn() },
    };
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await makeAdapter(prisma).calculateForRange('organization-1', from, to);
    expect(result.adCost).toBe(0);
    expect(result.adRevenue).toBe(0);
    expect(result.adImpressions).toBe(0);
    expect(result.adClicks).toBe(0);
    expect(result.adConversions).toBe(0);
    expect(result.adEvidenceComplete).toBe(false);
  });
});

describe('ProfitCalculationRepositoryAdapter.calculateDailyForRange', () => {
  const from = new Date('2026-09-01T15:00:00.000Z');
  const to = new Date('2026-09-03T15:00:00.000Z');
  const completeOption = {
    costPriceOverride: 20,
    commissionRate: 0.1,
    shippingCost: 0,
    otherCost: 0,
    inventoryComponents: [],
  };
  const order = (listingOption: unknown = completeOption) => ({
    orderedAt: new Date('2026-09-01T16:00:00.000Z'),
    shippingPrice: 0,
    lineItems: [{ quantity: 2, totalPrice: 100, listingOption }],
  });

  it('calculates KST-day costs and profit only on the same day as explicit ad evidence', async () => {
    const rows = await makeAdapter(makePrisma([order()]), [ownerRow('2026-09-02')])
      .calculateDailyForRange('organization-1', from, to);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-02', revenue: 100, qty: 2, costOfGoods: 40,
      commission: 10, cost: 50, adCost: 0, netProfit: 50, profitRate: 50,
      hasOrderEvidence: true, hasAdEvidence: true, costComplete: true,
    });
  });

  it.each([
    [null, 'MISSING_LISTING_OPTION'],
    [{ ...completeOption, costPriceOverride: null }, 'MISSING_COST_PRICE'],
    [{ ...completeOption, commissionRate: null }, 'MISSING_COMMISSION_RATE'],
    [{ ...completeOption, shippingCost: null }, 'MISSING_SHIPPING_COST'],
    [{ ...completeOption, otherCost: null }, 'MISSING_OTHER_COST'],
    [{ ...completeOption, costPriceOverride: null, inventoryComponents: [
      { quantity: 1, sellpiaInventorySku: { purchasePrice: null } },
    ] }, 'MISSING_PURCHASE_PRICE'],
  ])('retains revenue but withholds profit for missing cost evidence: %s', async (option, reason) => {
    const rows = await makeAdapter(makePrisma([order(option)]), [ownerRow('2026-09-02')])
      .calculateDailyForRange('organization-1', from, to);
    expect(rows[0]).toMatchObject({ revenue: 100, adCost: 0, costComplete: false, netProfit: null });
    expect(rows[0]?.costIncompleteReasons).toContain(reason);
  });

  it('does not convert an ad-only day into order or profit evidence', async () => {
    const rows = await makeAdapter(makePrisma([]), [ownerRow('2026-09-02')])
      .calculateDailyForRange('organization-1', from, to);
    expect(rows[0]).toMatchObject({ hasOrderEvidence: false, hasAdEvidence: true, netProfit: null });
  });

  it('preserves nonoverlapping order/ad dates without a fabricated profit intersection', async () => {
    const rows = await makeAdapter(makePrisma([order()]), [ownerRow('2026-09-03')])
      .calculateDailyForRange('organization-1', from, to);
    expect(rows.map(({ date, netProfit }) => ({ date, netProfit }))).toEqual([
      { date: '2026-09-02', netProfit: null }, { date: '2026-09-03', netProfit: null },
    ]);
  });

  it('preserves owner ad read failure even when the range has no orders', async () => {
    const prisma = makePrisma([]);
    const adapter = new ProfitCalculationRepositoryAdapter(
      prisma as unknown as PrismaService,
      { readPublished: vi.fn().mockRejectedValue(new Error('owner unavailable')) },
    );

    const rows = await adapter.calculateDailyForRange(
      'organization-1',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-03T00:00:00.000Z'),
    );

    expect(rows.map((row) => row.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(rows.every((row) => row.hasOrderEvidence === false)).toBe(true);
    expect(rows.every((row) => row.adEvidenceError === 'AD_EVIDENCE_READ_FAILED')).toBe(true);
  });
});
