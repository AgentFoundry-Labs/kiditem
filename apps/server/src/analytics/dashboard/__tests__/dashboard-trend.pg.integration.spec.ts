import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardTrendService } from '../application/service/dashboard-trend.service';
import { DashboardTrendRepositoryAdapter } from '../adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../../test-helpers/finance-seeds';

describe('DashboardTrendService.getTrend (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardTrendService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardTrendService,
        DashboardTrendRepositoryAdapter,
        WingTrafficAggregationRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardTrendService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Seed a TEST listing + a single yesterday order with given lineItem totalPrice
   * and optional ad spend on the same date.
   */
  async function seedTestListingWithYesterdayOrder(opts: {
    suffix: string;
    lineItemTotalPrice: number;
    /** Used as Order.totalPrice deliberately — sentinel for I3 fix verification. */
    orderTotalPriceOverride?: number;
    costPrice?: number;
    adSpend?: number;
  }) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${opts.suffix}`, name: `Master T-${opts.suffix}`,
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${opts.suffix}`, costPrice: opts.costPrice ?? 0, commissionRate: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${opts.suffix}`,
      optionId, externalOptionId: `VI-T-${opts.suffix}`,
    });

    if (opts.orderTotalPriceOverride !== undefined) {
      // Bypass helper to set Order.totalPrice independently of lineItem totals.
      const order = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          platform: 'coupang',
          externalOrderId: `TREND-T-${opts.suffix}`,
          orderedAt: yesterday,
          status: 'paid',
          totalPrice: opts.orderTotalPriceOverride,
          shippingPrice: 0,
        },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: order.id,
          listingOptionId,
          optionId,
          quantity: 1,
          unitPrice: opts.lineItemTotalPrice,
          totalPrice: opts.lineItemTotalPrice,
          externalLineId: `LI-${order.id}-0`,
        },
      });
    } else {
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `TREND-T-${opts.suffix}`,
        orderedAt: yesterday.toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: opts.lineItemTotalPrice, optionId, listingOptionId }],
      });
    }

    if (opts.adSpend !== undefined) {
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID, listingId,
        date: yesterday.toISOString().slice(0, 10), spend: opts.adSpend,
      });
    }
    return { listingId, optionId, listingOptionId };
  }

  it('T1: TEST sees only TEST rows — OTHER sentinel never leaks', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '1', lineItemTotalPrice: 30_000 });
    // OTHER sentinel
    const oM = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-1', name: 'OM' });
    const oO = await setupProductOption(prisma, { organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id, sku: 'SKU-O-1' });
    const oL = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-1', optionId: oO.id, externalOptionId: 'VI-O-1',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'TREND-O-1',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, listingId: oL.listingId,
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), spend: IDOR_SENTINEL,
    });

    const result = await service.getTrend(TEST_ORGANIZATION_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(IDOR_SENTINEL);
      expect(row.adCost).not.toBe(IDOR_SENTINEL);
    }
    const yesterdayRow = result.find((r) => r.revenue === 30_000);
    expect(yesterdayRow).toBeDefined();
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '2', lineItemTotalPrice: 30_000 });
    const oM = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-2', name: 'OM' });
    const oO = await setupProductOption(prisma, { organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id, sku: 'SKU-O-2' });
    const oL = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-2', optionId: oO.id, externalOptionId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'TREND-O-2',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });

    const result = await service.getTrend(OTHER_ORGANIZATION_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(30_000);
    }
    expect(result.find((r) => r.revenue === IDOR_SENTINEL)).toBeDefined();
  });

  it('T3: fresh organization → []', async () => {
    const result = await service.getTrend(TEST_ORGANIZATION_ID, '7d');
    expect(result).toEqual([]);
  });

  it('T4: I3 fix — revenue from SUM(oli.total_price), NOT SUM(o.total_price); avgProfitRate ratio applied', async () => {
    // Sentinel: Order.totalPrice = 999_999_999 vs lineItem.totalPrice = 100_000.
    // Pre-fix would aggregate Order.totalPrice → revenue = 999M.
    // Post-fix aggregates lineItem.totalPrice → revenue = 100k.
    // Cost set to produce avgProfitRate ≈ 0.3 → daily profit = 30_000.
    // costPrice 70_000 → netProfit (range total) = 100_000 - 70_000 - 0 - 0 - 0 - 0 = 30_000
    // avgProfitRate = 30_000 / 100_000 = 0.3 → daily profit = 100_000 × 0.3 = 30_000
    await seedTestListingWithYesterdayOrder({
      suffix: '4',
      lineItemTotalPrice: 100_000,
      orderTotalPriceOverride: 999_999_999,
      costPrice: 70_000,
    });

    const result = await service.getTrend(TEST_ORGANIZATION_ID, '30d');
    const yesterdayRow = result.find((r) => r.revenue === 100_000);
    expect(yesterdayRow).toBeDefined();
    expect(yesterdayRow?.profit).toBe(30_000);
    // Critical assertion: revenue is NOT the bogus Order.totalPrice
    for (const row of result) {
      expect(row.revenue).not.toBe(999_999_999);
    }
  });
});
