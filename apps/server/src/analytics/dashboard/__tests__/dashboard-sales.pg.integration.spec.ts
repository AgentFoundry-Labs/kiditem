import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { buildDashboardContext } from '../application/service/context';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
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
} from '../../../test-helpers/finance-seeds';

describe('DashboardSalesService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardSalesService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardSalesService,
        DashboardSalesRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardSalesService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Helper: create a single seeded master+listing+option for current month.
   * Returns IDs for further per-order seeding.
   */
  async function seedTestListing(suffix: string) {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${suffix}`, name: `Master T-${suffix}`, abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${suffix}`, costPrice: 50_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${suffix}`, channelName: '쿠팡',
      optionId, externalOptionId: `VI-T-${suffix}`,
    });
    return { masterId, optionId, listingId, listingOptionId };
  }

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  it('T1: baseline monthly — single order, math verified', async () => {
    const { optionId, listingOptionId } = await seedTestListing('1');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.revenue).toBe(100_000);
    expect(result.monthly.profit).toBe(30_000);             // 100k - 50k - 10k - 10k - 0 - 0
    expect(result.monthly.adRate).toBe(0);                  // no ad
    expect(result.profitDetail?.netProfit).toBe(30_000);
    expect(result.profitDetail?.commission).toBe(10_000);
    expect(result.profitDetail?.shippingCost).toBe(10_000);
    expect(result.planAchievement).toBeNull();
  });

  it('T2: IDOR isolation — OTHER sentinel never leaks into TEST', async () => {
    const t = await seedTestListing('2');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: t.optionId, listingOptionId: t.listingOptionId }],
    });

    // OTHER sentinel
    const oMaster = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-2', name: 'Other M2' });
    const oOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id, sku: 'SKU-O-2', costPrice: 0, commissionRate: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O-2',
      optionId: oOption.id, externalOptionId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'SALES-O-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.revenue).toBe(1_000);
    expect(result.monthly.revenue).not.toBe(IDOR_SENTINEL);
    expect(result.today.revenue).not.toBe(IDOR_SENTINEL);
    for (const tp of result.topProducts) {
      expect(tp.revenue).not.toBe(IDOR_SENTINEL);
    }
  });

  it('T3: rangeKpi reflects week window when range=week', async () => {
    const { optionId, listingOptionId } = await seedTestListing('3');
    // Seed an order 3 days ago (inside week window)
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-3',
      orderedAt: recent.toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext('week');
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.rangeKpi).toBeDefined();
    expect(result.rangeKpi?.range).toBe('week');
    expect(result.rangeKpi?.revenue).toBe(50_000);
  });

  it('T4: empty organization returns zero-valued structure (no error)', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.revenue).toBe(0);
    expect(result.monthly.profit).toBe(0);
    expect(result.monthly.adRate).toBe(0);
    expect(result.topProducts).toEqual([]);
    expect(result.monthlyTrend).toHaveLength(6);            // 6 months loop always emits 6 entries
    expect(result.monthlyTrend.every((t) => t.revenue === 0)).toBe(true);
    expect(result.profitDetail?.revenue).toBe(0);
    expect(result.trafficKpi?.adSummary).toBeNull();
    expect(result.lastSyncAt).toBeNull();
  });

  it('T5: Wing override flows through trafficKpi.adSummary + lastSyncAt', async () => {
    // Hard rewrite Phase H3b — wing dashboard ad-summary now lives in
    // ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_dashboard').
    await seedTestListing('5');
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const businessDate = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    await prisma.channelAccountDailyKpiSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        source: 'wing',
        kpiType: 'wing_dashboard',
        businessDate,
        normalizedJson: {
          startDate: monthStartStr,
          adSummary: { adGmv: '7777', adSpend: '2222' },
        },
        lastObservedAt: now,
        firstObservedAt: now,
      },
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.trafficKpi?.adSummary).toMatchObject({ adGmv: '7777', adSpend: '2222' });
    expect(result.trafficKpi?.source).toBe('wing');
    expect(result.lastSyncAt).not.toBeNull();
  });

  it('T6: topProducts ranks by revenue DESC, capped at 10', async () => {
    // Seed 12 listings × 1 order each, decreasing revenue 12000, 11000, ..., 1000
    for (let i = 1; i <= 12; i++) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-T-TOP-${i}`, name: `Top ${i}`, abcGrade: i <= 4 ? 'A' : i <= 8 ? 'B' : 'C',
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, sku: `SKU-T-TOP-${i}`, costPrice: 0, commissionRate: 0,
      });
      const { listingOptionId } = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel: 'coupang', externalId: `EXT-T-TOP-${i}`, channelName: `채널${i}`,
        optionId, externalOptionId: `VI-T-TOP-${i}`,
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `SALES-T-TOP-${i}`,
        orderedAt: midMonth().toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: (13 - i) * 1_000, optionId, listingOptionId }],
      });
    }

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.topProducts).toHaveLength(10);
    expect(result.topProducts[0].revenue).toBe(12_000);
    expect(result.topProducts[9].revenue).toBe(3_000);
    expect(result.topProducts[0].name).toBe('Top 1');
    expect(result.topProducts[0].organization).toBe('채널1');     // ChannelListing.channelName

    // KNOWN APPROXIMATION assertion (critic MAJOR #2):
    // Top-N rows always carry profitRate=30.0 and netProfit=round(revenue*0.3).
    // If this assertion fails, someone replaced the approximation — update release
    // note + remove this guard.
    expect(result.topProducts[0].profitRate).toBe(30.0);
    expect(result.topProducts[0].netProfit).toBe(Math.round(12_000 * 0.3));
  });
});
