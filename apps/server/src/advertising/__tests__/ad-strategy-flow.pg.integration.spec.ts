import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { periodBounds } from '../domain/ad-metrics';
import { AdvertisingModule } from '../advertising.module';
import { AdActionService } from '../application/service/ad-action.service';
import { AdStrategyService } from '../application/service/ad-strategy.service';
import { deriveAdActionExecution, readLatestExecutionTasks } from '../read/ad-action-execution';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { AdWeeklyPlan } from '@kiditem/shared/advertising';
import {
  seedAd as seedAdTargetDay,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../test-helpers/finance-seeds';
import { seedPublishedProductAbcGrades } from '../../products/__tests__/test-helpers/published-product-abc';

describe('AdStrategy flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: AdStrategyService;
  let adActionService: AdActionService;
  let inventoryImportRunByOrganization = new Map<string, string>();

  async function seedOrderWithLineItems(
    client: PrismaClient,
    opts: {
      organizationId: string;
      externalOrderId: string;
      orderedAt: string;
      shippingPrice: number;
      lineItems: Array<{
        quantity: number;
        totalPrice: number;
        listingOptionId: string;
        optionId?: string;
      }>;
      /**
       * Channel of the account the order came through. Defaults to the
       * organization's Coupang account; `'rocket'` is a Rocket direct-purchase
       * order, whose sales carry no commission or other per-sale cost.
       */
      orderChannel?: string;
    },
  ) {
    const account = opts.orderChannel
      ? await client.channelAccount.upsert({
          where: {
            organizationId_channel_externalAccountId: {
              organizationId: opts.organizationId,
              channel: opts.orderChannel,
              externalAccountId: `advertising-strategy-${opts.orderChannel}`,
            },
          },
          create: {
            organizationId: opts.organizationId,
            channel: opts.orderChannel,
            name: `Advertising Strategy PG ${opts.orderChannel}`,
            externalAccountId: `advertising-strategy-${opts.orderChannel}`,
          },
          update: {},
        })
      : await client.channelAccount.findFirstOrThrow({
          where: {
            organizationId: opts.organizationId,
            channel: 'coupang',
            status: 'active',
          },
          orderBy: { isPrimary: 'desc' },
        });
    const order = await client.order.create({
      data: {
        organizationId: opts.organizationId,
        channelAccountId: account.id,
        externalOrderId: opts.externalOrderId,
        orderedAt: new Date(opts.orderedAt),
        status: 'accepted',
        shippingPrice: opts.shippingPrice,
        totalPrice: opts.lineItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0,
        ),
      },
    });
    await client.orderLineItem.createMany({
      data: opts.lineItems.map((item, index) => ({
        organizationId: opts.organizationId,
        orderId: order.id,
        listingOptionId: item.listingOptionId,
        productName: `Product ${index + 1}`,
        quantity: item.quantity,
        unitPrice: Math.round(item.totalPrice / item.quantity),
        totalPrice: item.totalPrice,
        externalLineId: `${opts.externalOrderId}-${index + 1}`,
      })),
    });
    return order;
  }

  async function seedGradedListing(params: {
    organizationId: string;
    abcGrade: 'A' | 'B' | 'C';
    sellableStock?: number | null;
    costPrice?: number | null;
    sellPrice?: number | null;
    suffix: string;
  }) {
    const channelAccount =
      (await prisma.channelAccount.findFirst({
        where: {
          organizationId: params.organizationId,
          channel: 'coupang',
          externalAccountId: 'advertising-strategy-pg',
        },
      })) ??
      (await prisma.channelAccount.create({
        data: {
          organizationId: params.organizationId,
          channel: 'coupang',
          name: 'Advertising Strategy PG Coupang',
          externalAccountId: 'advertising-strategy-pg',
          isPrimary: true,
        },
      }));
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: params.organizationId,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: channelAccount.id,
        fileName: 'advertising-strategy-pg.xlsx',
        fileHash: `advertising-strategy-pg-${params.suffix}`,
        status: 'completed',
        rowCount: 1,
        importedAt: new Date(),
      },
    });
    const sellableStock = params.sellableStock ?? 100;
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: params.organizationId,
        code: `M-${params.suffix}`,
        name: `Master ${params.suffix}`,
      },
    });
    await seedPublishedProductAbcGrades(prisma, {
      organizationId: params.organizationId,
      grades: [{ masterProductId: master.id, abcGrade: params.abcGrade }],
    });
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: params.organizationId,
        code: `SP-${params.suffix}`,
        name: `Sellpia ${params.suffix}`,
        currentStock: sellableStock,
        purchasePrice: params.costPrice ?? 5000,
        lastImportRunId: inventoryImportRunByOrganization.get(params.organizationId),
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId: channelAccount.id,
        masterProductId: master.id,
        externalId: `EXT-${params.suffix}`,
        channelName: `Channel ${params.suffix}`,
        lastImportRunId: importRun.id,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        externalOptionId: `VI-${params.suffix}`,
        salePrice: params.sellPrice ?? 20000,
        lastImportRunId: importRun.id,
        isActive: true,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: params.organizationId,
        channelListingOptionId: listingOption.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 1,
      },
    });
    const option = listingOption;
    return { master, option, listing, listingOption };
  }

  /**
   * A measured listing-day ad fact in the advertising target-day ledger, on the
   * clock's last closed KST day or `daysAgo` days before it. The date is a KST
   * business date written out, never the machine's local midnight, which on a
   * UTC host would land on the still-open 20th outside every ad window.
   */
  async function seedAd(params: {
    organizationId: string;
    listingId: string;
    optionId?: string | null;
    externalId?: string;
    daysAgo?: number;
    spend: number;
    revenue: number;
    clicks?: number;
    impressions?: number;
    conversions?: number;
    conversionsObserved?: boolean;
  }) {
    await seedAdTargetDay(prisma, {
      organizationId: params.organizationId,
      listingId: params.listingId,
      date: septemberDay(19 - (params.daysAgo ?? 0)),
      spend: params.spend,
      revenue: params.revenue,
      clicks: params.clicks ?? 0,
      impressions: params.impressions ?? 0,
      conversions: params.conversions ?? 0,
      conversionsObserved: params.conversionsObserved,
    });
  }

  /**
   * The clock every case reads at. Profit rates evaluate the current KST month
   * clipped to its closed days (ADR-0001), so on the wall clock that window
   * would move under the fixtures and be empty on the 1st. 12:00 KST on
   * 20 September 2026 closes 1–19 September.
   */
  const STRATEGY_NOW = new Date('2026-09-20T03:00:00.000Z');

  /** A `YYYY-MM-DD` business date in the clock's month. */
  function septemberDay(dayOfMonth: number): string {
    return `2026-09-${String(dayOfMonth).padStart(2, '0')}`;
  }

  /** Noon KST on a day of the clock's month, as an ISO instant. */
  function saleAt(dayOfMonth: number): string {
    return new Date(`${septemberDay(dayOfMonth)}T12:00:00+09:00`).toISOString();
  }

  /**
   * The campaign sweep measured the clock's month from the 1st through its
   * last closed day, the most a real sweep can have reached — the window the
   * strategy context reads per-listing profit over. Per-listing profit is
   * withheld for the whole window unless every date in it was measured
   * (ADR-0006), so a test that expects a measured profit rate has to declare
   * the sweep's coverage.
   */
  async function measureClosedDays(organizationId: string) {
    await seedCompletedAdSweepRun(prisma, {
      organizationId,
      generation: 1,
      window: { startDate: septemberDay(1), endDate: septemberDay(19) },
    });
  }

  /**
   * The Orders collection covered the clock's month from the 1st through
   * `throughDay`. Seed the orders first: the run adopts the orders already in
   * its window.
   */
  async function collectOrders(organizationId: string, throughDay = 19) {
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId,
      startDate: septemberDay(1),
      endDate: septemberDay(throughDay),
    });
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AdvertisingModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    service = m.get(AdStrategyService);
    adActionService = m.get(AdActionService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(STRATEGY_NOW);
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    inventoryImportRunByOrganization = new Map();
    for (const organizationId of [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID]) {
      const verifiedAt = new Date();
      const inventoryRun = await prisma.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: 'sellpia_inventory',
          channelAccountId: null,
          fileName: 'advertising-strategy-inventory.json',
          fileHash: `advertising-strategy-inventory-${organizationId}`,
          status: 'completed',
          rowCount: 0,
          importedAt: verifiedAt,
          lastVerifiedAt: verifiedAt,
          verificationCount: 1,
          freshnessGeneration: 1n,
        },
      });
      inventoryImportRunByOrganization.set(organizationId, inventoryRun.id);
      await prisma.sellpiaInventoryState.create({
        data: {
          organizationId,
          requestedGeneration: 1n,
          verifiedGeneration: 1n,
          lastVerifiedAt: verifiedAt,
          lastCompletedImportRunId: inventoryRun.id,
        },
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRules / getWeeklyPlan — 3-grade listing scenario', () => {
    it('#1 A 등급 ROAS 480+ → recommendations 에 포함 + summary 집계', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        costPrice: 10_000,
        suffix: 'A-EXPAND',
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ORD-A-EXPAND',
        orderedAt: saleAt(15),
        shippingPrice: 2_000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 20_000,
            optionId: a.option.id,
            listingOptionId: a.listingOption.id,
          },
        ],
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 2_000,
        revenue: 10_000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await measureClosedDays(TEST_ORGANIZATION_ID);
      await collectOrders(TEST_ORGANIZATION_ID);

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);

      expect(rules.recommendations.length).toBeGreaterThanOrEqual(1);
      const aAction = rules.recommendations.find((row) => row.listing.listingId === a.listing.id);
      expect(aAction?.grade).toBe('A');
      expect(aAction?.priority).toBe('high');
      // The listing is on a Coupang Wing account, whose sales commission has no
      // measured source (KID-114): its profit rate is unknown, so no rate is
      // proposed.
      expect(aAction?.proposedValue).toBeNull();
      expect(rules.summary.totalActions).toBe(rules.recommendations.length);
      expect(rules.summary.urgentCount).toBe(
        rules.recommendations.filter((r) => r.priority === 'urgent').length,
      );
    });

    /**
     * KID-85 follow-up P3-14 — a listing whose profit is withheld for an
     * unmeasured cost is absent from the profit rates, so the plan says how
     * many of its listings that is instead of reasoning over a silent subset.
     */
    it('reports how many of its listings had their profit withheld for an unmeasured cost', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        costPrice: 10_000,
        suffix: 'WITHHELD',
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ORD-WITHHELD',
        orderedAt: saleAt(15),
        shippingPrice: 0,
        lineItems: [{
          quantity: 1,
          totalPrice: 20_000,
          optionId: a.option.id,
          listingOptionId: a.listingOption.id,
        }],
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 1_000,
        revenue: 5_000,
        clicks: 10,
        impressions: 1_000,
        conversions: 1,
      });
      await measureClosedDays(TEST_ORGANIZATION_ID);
      await collectOrders(TEST_ORGANIZATION_ID);

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      // The order came through a Coupang account, whose sales commission has
      // no measured source: the listing's profit is withheld over a window the
      // Orders collection did cover.
      expect(plan.orderWindowComplete).toBe(true);
      expect(plan.profitWithheldListings).toBe(1);
    });

    it('#2 3-grade listing 동시 평가 + priority 정렬', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'A-GOOD',
      });
      const b = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'B-OK',
      });
      const c = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        sellableStock: 0,
        suffix: 'C-URGENT',
      });

      // A: 공격 확장 (high)
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // B: 유지 (low)
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: b.listing.id,
        optionId: b.option.id,
        spend: 10000,
        revenue: 35000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // C: 재고 0 + 측정 광고비 발생 → 긴급
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      expect(plan.actions.length).toBe(3);
      // priority 정렬: urgent 먼저
      expect(plan.actions[0].priority).toBe('urgent');
      expect(plan.actions[0].grade).toBe('C');
      expect(plan.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(plan.week.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('#3 getWeeklyPlan 의 issues + top20 shape', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        costPrice: 10_000,
        suffix: 'A-TOP',
      });

      // 14일 내 Ad history → adIssues 포착 (highSpend)
      for (let i = 0; i < 10; i++) {
        await seedAd({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          optionId: a.option.id,
          daysAgo: i,
          spend: 15000,
          revenue: 30000,
          clicks: 50,
          impressions: 5000,
          conversions: 5,
        });
      }
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ORD-A-TOP',
        orderedAt: new Date().toISOString(),
        shippingPrice: 2_000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 20_000,
            optionId: a.option.id,
            listingOptionId: a.listingOption.id,
          },
        ],
      });
      const trafficDate = periodBounds('14d').to;
      await prisma.channelListingDailySnapshot.createMany({
        data: [
          {
            organizationId: TEST_ORGANIZATION_ID,
            listingId: a.listing.id,
            channel: 'coupang',
            externalId: a.listing.externalId,
            businessDate: trafficDate,
            trafficRevenue: 123_456,
            trafficOrders: 7,
            trafficObservedAt: new Date('2026-09-01T03:00:00.000Z'),
          },
          {
            organizationId: TEST_ORGANIZATION_ID,
            listingId: a.listing.id,
            channel: 'coupang',
            externalId: a.listing.externalId,
            businessDate: new Date(trafficDate.getTime() - 86_400_000),
            trafficRevenue: 900_000,
            trafficOrders: 90,
            trafficObservedAt: null,
          },
        ],
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      // Issues shape
      expect(plan.issues).toHaveProperty('zeroConversion');
      expect(plan.issues).toHaveProperty('lowRoas');
      expect(plan.issues).toHaveProperty('highSpend');
      // highSpend 배열에 포함 (spend 15000 * 10 = 150000 > 10000)
      expect(plan.issues.highSpend.length).toBeGreaterThanOrEqual(1);
      expect(plan.issues.highSpend[0].listing.listingId).toBe(a.listing.id);

      // top20: listing 포함 + rank=1
      expect(plan.top20.length).toBe(1);
      expect(plan.top20[0].rank).toBe(1);
      expect(plan.top20[0].listing.listingId).toBe(a.listing.id);
      expect(plan.top20[0].traffic).toEqual({ revenue: 123_456, orders: 7 });
    });

    it('전환 컬럼 미관측이면 C-5 안 냄 — an unobserved conversion column raises no zero-conversion action or issue', async () => {
      const unobserved = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'C5-UNOBSERVED',
      });
      const observed = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'C5-OBSERVED',
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: unobserved.listing.id,
        spend: 8_000,
        revenue: 20_000,
        clicks: 80,
        impressions: 8_000,
        conversions: 0,
        conversionsObserved: false,
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: observed.listing.id,
        spend: 8_000,
        revenue: 20_000,
        clicks: 80,
        impressions: 8_000,
        conversions: 0,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      const actionFor = (listingId: string) =>
        plan.actions.find((action) => action.listing.listingId === listingId);
      expect(actionFor(unobserved.listing.id)?.reason ?? '').not.toContain('전환 0');
      expect(actionFor(observed.listing.id)).toMatchObject({ priority: 'urgent' });
      expect(actionFor(observed.listing.id)?.reason).toContain('전환 0');
      expect(plan.issues.zeroConversion.map((issue) => issue.listing.listingId)).toEqual([
        observed.listing.id,
      ]);
      const top = plan.top20.find((item) => item.listing.listingId === unobserved.listing.id);
      expect(top?.metrics).toMatchObject({ conversions: null, cvr: null });
    });

    it('withholds traffic rows outside the owner-declared population coverage', async () => {
      const measured = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'TRAFFIC-COVERAGE-MEASURED',
      });
      const missing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'TRAFFIC-COVERAGE-MISSING',
      });
      for (const listing of [measured, missing]) {
        await seedAd({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.listing.id,
          optionId: listing.option.id,
          spend: 10_000,
          revenue: 20_000,
        });
      }
      const trafficDate = periodBounds('14d').to;
      await prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: measured.listing.id,
          channel: 'coupang',
          externalId: measured.listing.externalId,
          businessDate: trafficDate,
          trafficRevenue: 123_456,
          trafficOrders: 7,
          trafficObservedAt: new Date('2026-09-01T03:00:00.000Z'),
        },
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);
      const measuredTopRow = plan.top20.find(
        (row) => row.listing.listingId === measured.listing.id,
      );
      expect(measuredTopRow?.traffic).toBeNull();
    });
  });

  /**
   * KID-136 — profit rates evaluate the current KST month clipped to its closed
   * days (ADR-0001): the only dates an Orders collection and the campaign sweep
   * can have covered. A Rocket direct-purchase sale carries no commission or
   * other per-sale cost, so its listing's profit is measurable once both
   * sources cover that window.
   */
  describe('profit rates over the closed days of the current KST month', () => {
    /**
     * An A-grade listing sold once at noon KST on `businessDate` through a
     * Rocket account and advertised that day: 20,000 revenue − 10,000 purchase
     * cost − 2,000 shipping − 2,000 ad spend = 6,000, a 30% profit rate.
     */
    async function seedRocketSale(suffix: string, businessDate: string): Promise<string> {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        costPrice: 10_000,
        suffix,
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `ORD-${suffix}`,
        orderedAt: new Date(`${businessDate}T12:00:00+09:00`).toISOString(),
        shippingPrice: 2_000,
        orderChannel: 'rocket',
        lineItems: [{
          quantity: 1,
          totalPrice: 20_000,
          listingOptionId: listing.listingOption.id,
        }],
      });
      await seedAdTargetDay(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.listing.id,
        date: businessDate,
        spend: 2_000,
        revenue: 10_000,
        clicks: 100,
        impressions: 10_000,
        conversions: 10,
      });
      return listing.listing.id;
    }

    function proposedRate(plan: AdWeeklyPlan, listingId: string): number | null {
      return plan.actions.find((action) => action.listing.listingId === listingId)?.proposedValue ?? null;
    }

    it('proposes a rate from the closed days once orders and the sweep cover them', async () => {
      const listingId = await seedRocketSale('ROCKET-COVERED', septemberDay(15));
      await measureClosedDays(TEST_ORGANIZATION_ID);
      await collectOrders(TEST_ORGANIZATION_ID);

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      // Both sources stop at the 19th; the open 20th is not asked for.
      expect(proposedRate(plan, listingId)).toBe(30);
      expect(plan.profitWithheldListings).toBe(0);
      expect(plan.orderWindowComplete).toBe(true);
    });

    it('proposes no rate while the Orders collection stops short of the last closed day', async () => {
      const listingId = await seedRocketSale('ROCKET-ORDERS-SHORT', septemberDay(15));
      await measureClosedDays(TEST_ORGANIZATION_ID);
      await collectOrders(TEST_ORGANIZATION_ID, 18);

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      // The 19th was not collected, so the rows are only the orders collected
      // so far and no rate over them is the window's.
      expect(plan.orderWindowComplete).toBe(false);
      expect(proposedRate(plan, listingId)).toBeNull();
    });

    it('proposes no rate on the 1st rather than borrowing the closed previous month', async () => {
      // 12:00 KST on 1 September: August has closed, September has no closed
      // day. August is collected, swept and holds a measurable 30% sale.
      vi.setSystemTime(new Date('2026-09-01T03:00:00.000Z'));
      const listingId = await seedRocketSale('ROCKET-FIRST', '2026-08-25');
      await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-08-01', endDate: '2026-08-31' },
      });
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      expect(plan.orderWindowComplete).toBe(false);
      expect(plan.profitWithheldListings).toBe(0);
      expect(proposedRate(plan, listingId)).toBeNull();
    });
  });

  describe('getRecommendations', () => {
    it('#4 urgent/high 만 필터링, 20개 limit', async () => {
      // urgent 1건 + high 2건 + low 1건 seed
      const c = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        sellableStock: 0,
        suffix: 'C-URGENT',
      });
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'A-HIGH',
      });
      const b = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'B-LOW',
      });

      // urgent: 재고 0
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 5000,
        revenue: 5000,
        clicks: 50,
        impressions: 5000,
      });
      // A-1 high: ROAS 500
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // B-3 low: ROAS 310
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: b.listing.id,
        optionId: b.option.id,
        spend: 10000,
        revenue: 31000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const recs = await service.getRecommendations(TEST_ORGANIZATION_ID);

      expect(recs.length).toBeLessThanOrEqual(20);
      // low 는 제외
      for (const r of recs) {
        expect(['urgent', 'high']).toContain(r.priority);
      }
      // urgent 가 먼저 (calcActions priority sort)
      if (recs.length >= 2) {
        expect(recs[0].priority === 'urgent' || recs[0].priority === 'high').toBe(true);
      }
      // recommendation shape
      expect(recs[0]).toHaveProperty('listing');
      expect(recs[0]).toHaveProperty('title');
      expect(recs[0]).toHaveProperty('body');
    });
  });

  describe('registerCampaign — IDOR + duplicate guard', () => {
    it('#7 존재하지 않는 listingId → NotFoundException', async () => {
      const fakeListingId = '99999999-9999-4999-8999-999999999999';

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Test campaign',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: fakeListingId }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#8 cross-tenant listingId → NotFoundException (IDOR guard)', async () => {
      const foreign = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'FOREIGN',
      });

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Hijack attempt',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: foreign.listing.id }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#9 inactive listing → NotFoundException', async () => {
      const deleted = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'DELETED',
      });
      await prisma.channelListing.update({
        where: { id: deleted.listing.id },
        data: { isActive: false },
      });

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Deleted target',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: deleted.listing.id }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#10 유효 listing → AdAction + ExecutionTask 생성', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'OK',
      });

      const result = await service.registerCampaign(
        {
          campaignName: 'OK campaign',
          adGroupName: 'ag',
          grade: 'A',
          dailyBudget: 10000,
          operationMode: 'manual',
          listings: [{ listingId: listing.listing.id }],
          keywords: [{ keyword: 'kids toy', bidPrice: 200 }],
          targetRoas: 300,
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result.ok).toBe(true);
      expect(result.actionId).toBeTruthy();
      expect(result.taskId).toBeTruthy();

      const action = await prisma.adAction.findUniqueOrThrow({
        where: { id: result.actionId },
      });
      expect(action.organizationId).toBe(TEST_ORGANIZATION_ID);
      expect(action.actionType).toBe('create_campaign');
      expect(action.targetType).toBe('campaign');
      expect(action.targetLabel).toBe('OK campaign');
      expect(action.priority).toBe('high'); // grade A → high
      expect(action.approvalStatus).toBe('approved');
      const latestTasks = await readLatestExecutionTasks(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        actionIds: [result.actionId],
      });
      expect(
        deriveAdActionExecution(latestTasks.get(result.actionId) ?? null, new Date()).executeStatus,
      ).toBe('queued');

      const tasks = await prisma.executionTask.findMany({
        where: { actionId: result.actionId },
      });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('queued');
    });

    it('#11 동일 campaignName 재등록 → ConflictException', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'DUP',
      });
      const dto = {
        campaignName: 'Duplicate campaign',
        adGroupName: 'ag',
        grade: 'A',
        dailyBudget: 10000,
        operationMode: 'manual',
        listings: [{ listingId: listing.listing.id }],
      };

      await service.registerCampaign(dto, TEST_ORGANIZATION_ID);

      await expect(
        service.registerCampaign(dto, TEST_ORGANIZATION_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('#11b a done registration keeps the name taken; a failed one can be registered again', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'RETRY',
      });
      const dto: Parameters<AdStrategyService['registerCampaign']>[0] = {
        campaignName: 'Retry campaign',
        adGroupName: 'ag',
        grade: 'A',
        dailyBudget: 10000,
        operationMode: 'manual',
        listings: [{ listingId: listing.listing.id }],
      };

      const first = await service.registerCampaign(dto, TEST_ORGANIZATION_ID);
      await prisma.executionTask.updateMany({
        where: { actionId: first.actionId },
        data: { status: 'failed', finishedAt: new Date(), errorMessage: '폼 검증 실패' },
      });
      const second = await service.registerCampaign(dto, TEST_ORGANIZATION_ID);
      expect(second.actionId).not.toBe(first.actionId);

      await prisma.executionTask.updateMany({
        where: { actionId: second.actionId },
        data: { status: 'done', finishedAt: new Date() },
      });
      await expect(
        service.registerCampaign(dto, TEST_ORGANIZATION_ID),
      ).rejects.toThrow(/등록 완료/);
    });

    it('#11c a rejected registration does not keep the name taken (KID-138)', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'REJECTED',
      });
      const dto: Parameters<AdStrategyService['registerCampaign']>[0] = {
        campaignName: 'Rejected campaign',
        adGroupName: 'ag',
        grade: 'A',
        dailyBudget: 10000,
        operationMode: 'manual',
        listings: [{ listingId: listing.listing.id }],
      };

      const first = await service.registerCampaign(dto, TEST_ORGANIZATION_ID);
      await expect(adActionService.rejectActions([first.actionId], TEST_ORGANIZATION_ID))
        .resolves.toEqual({ updated: 1 });

      const second = await service.registerCampaign(dto, TEST_ORGANIZATION_ID);
      expect(second.actionId).not.toBe(first.actionId);
      // The new registration is queued, so it takes the name again.
      await expect(
        service.registerCampaign(dto, TEST_ORGANIZATION_ID),
      ).rejects.toThrow(/등록 진행 중/);
    });
  });

  describe('cross-tenant scope', () => {
    it('#12 다른 회사의 Ad 집계에 침범하지 않음', async () => {
      const own = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'OWN',
      });
      const foreign = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'FOREIGN',
      });

      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: own.listing.id,
        optionId: own.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedAd({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: foreign.listing.id,
        optionId: foreign.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].listing.listingId).toBe(own.listing.id);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Wave C4 — channel daily snapshot evidence on strategy actions
  // ─────────────────────────────────────────────────────────────

  describe('Wave C4 — channel state signals on getRules / getWeeklyPlan', () => {
    async function seedListingDaily(params: {
      organizationId: string;
      listingId: string;
      channel?: string;
      externalId: string;
      businessDate: string;
      isOfferWinner?: boolean | null;
      myPrice?: number | null;
      winnerPrice?: number | null;
      winnerGapPrice?: number | null;
      exposureStatus?: string | null;
      saleStatus?: string | null;
    }) {
      return prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: params.organizationId,
          listingId: params.listingId,
          channel: params.channel ?? 'coupang',
          externalId: params.externalId,
          businessDate: new Date(`${params.businessDate}T00:00:00Z`),
          sampleCount: 1,
          isOfferWinner: params.isOfferWinner ?? null,
          myPrice: params.myPrice ?? null,
          winnerPrice: params.winnerPrice ?? null,
          winnerGapPrice: params.winnerGapPrice ?? null,
          exposureStatus: params.exposureStatus ?? null,
          saleStatus: params.saleStatus ?? null,
        },
      });
    }

    async function seedOptionDaily(params: {
      organizationId: string;
      listingId: string;
      listingOptionId: string;
      externalId: string;
      externalOptionId: string;
      businessDate: string;
      stockQty?: number | null;
    }) {
      return prisma.channelListingOptionDailySnapshot.create({
        data: {
          organizationId: params.organizationId,
          listingId: params.listingId,
          listingOptionId: params.listingOptionId,
          channel: 'coupang',
          externalId: params.externalId,
          externalOptionId: params.externalOptionId,
          businessDate: new Date(`${params.businessDate}T00:00:00Z`),
          sampleCount: 1,
          stockQty: params.stockQty ?? null,
        },
      });
    }

    it('attaches latest listing+option daily snapshot to action.channelState (C4-#1)', async () => {
      const latestBusinessDate = periodBounds('14d').to;
      const latestBusinessDateText = latestBusinessDate.toISOString().slice(0, 10);
      const previousBusinessDateText = new Date(
        latestBusinessDate.getTime() - 86_400_000,
      ).toISOString().slice(0, 10);
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'C4-EV',
      });
      // H3 — the strategy aggregate now reads ad-metric columns from the
      // same `ChannelListingDailySnapshot` rows. Land the ad metrics on the
      // latest completed business-date row so it remains the latest businessDate AND carries
      // the spend/revenue the rule engine needs.
      await seedListingDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        externalId: a.listing.externalId,
        businessDate: previousBusinessDateText,
        isOfferWinner: true,
        myPrice: 12000,
      });
      await prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          channel: 'coupang',
          externalId: a.listing.externalId,
          businessDate: latestBusinessDate,
          isOfferWinner: false,
          myPrice: 12000,
          winnerPrice: 11500,
          winnerGapPrice: -500,
        },
      });
      await seedAdTargetDay(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        date: latestBusinessDate.toISOString().slice(0, 10),
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: 'VI-C4-EV',
        businessDate: latestBusinessDateText,
        stockQty: 0,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      expect(action?.channelState).not.toBeNull();
      expect(action?.channelState?.businessDate).toBe(latestBusinessDateText);
      expect(action?.channelState?.isOfferWinner).toBe(false);
      expect(action?.channelState?.winnerGapPrice).toBe(-500);
      expect(action?.channelState?.primaryOption?.stockQty).toBe(0);
      expect(action?.reason).toContain('아이템위너 아님');
      expect(action?.reason).toContain('옵션 재고 0');
      expect(action?.reason).toContain(`${latestBusinessDateText} 관측`);
    });

    it('uses the deterministic hydrated primary option, not an arbitrary option daily row (C4-#1b)', async () => {
      const latestBusinessDate = periodBounds('14d').to;
      const latestBusinessDateText = latestBusinessDate.toISOString().slice(0, 10);
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'C4-MULTI',
      });
      const earlierSku = await prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-C4-MULTI-EARLY',
          name: 'Sellpia C4 MULTI EARLY',
          currentStock: 100,
          purchasePrice: 5000,
        },
      });
      const earlierListingOption = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          externalOptionId: 'VI-C4-MULTI-EARLY',
          salePrice: 20000,
          lastImportRunId: a.listing.lastImportRunId,
          isActive: true,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: earlierListingOption.id,
          sellpiaInventorySkuId: earlierSku.id,
          quantity: 1,
        },
      });
      // The ad fact lives in the target-day ledger; the listing-daily row is
      // the latest channel state only.
      await seedListingDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        externalId: a.listing.externalId,
        businessDate: latestBusinessDateText,
        isOfferWinner: true,
      });
      await seedAdTargetDay(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        date: latestBusinessDateText,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: a.listingOption.externalOptionId,
        businessDate: latestBusinessDateText,
        stockQty: 0,
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: earlierListingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: earlierListingOption.externalOptionId,
        businessDate: latestBusinessDateText,
        stockQty: 7,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      expect(action?.channelState?.primaryOption?.listingOptionId).toBe(
        earlierListingOption.id,
      );
      expect(action?.channelState?.primaryOption?.stockQty).toBe(7);
      expect(action?.reason).not.toContain('옵션 재고 0');
    });

    it('observable state absent → reason untouched (C4-#2 fallback, H3 semantics)', async () => {
      // Ad facts live in the target-day ledger; `channelState` comes from the
      // latest listing-daily row that observed listing state. A row with no
      // observable state (a bare row, or a Wing traffic zero row) is not a
      // state observation, so the listing has no `channelState`. The C4
      // contract that matters here is: when no observable state is present,
      // the rule engine MUST NOT append the ' · 관측' evidence suffix to `reason`.
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'C4-NOSNAP',
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedListingDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        externalId: a.listing.externalId,
        businessDate: periodBounds('14d').to.toISOString().slice(0, 10),
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      // The bare daily row observed no winner/exposure/sale state.
      expect(action?.channelState).toBeNull();
      // No '관측' suffix, no winner-loss appendix — observable state was empty.
      expect(action?.reason).not.toContain('관측');
      expect(action?.reason).not.toContain('아이템위너');
    });

    it('cross-tenant — OTHER_COMPANY daily snapshot does not bleed into TEST_COMPANY action (C4-#3, H3 semantics)', async () => {
      const ours = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'C4-OURS',
      });
      const theirs = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'C4-THEIRS',
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: ours.listing.id,
        optionId: ours.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // Our own daily row observed only the sale status, so channelState exists
      // without any winner state of its own.
      await seedListingDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: ours.listing.id,
        externalId: ours.listing.externalId,
        businessDate: periodBounds('14d').to.toISOString().slice(0, 10),
        saleStatus: '판매중',
      });
      // Seed a noisy daily snapshot in the OTHER organization — must not leak.
      await seedListingDaily({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: theirs.listing.id,
        externalId: theirs.listing.externalId,
        businessDate: '2026-04-14',
        isOfferWinner: false,
        winnerGapPrice: -9999,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === ours.listing.id,
      );
      expect(action).toBeDefined();
      // channelState carries OUR externalId (not OTHER's -9999 winner gap).
      // The cross-tenant invariant is the externalId and the absence of
      // OTHER's winner state.
      expect(action?.channelState?.externalId).toBe(ours.listing.externalId);
      expect(action?.channelState?.winnerGapPrice).toBeNull();
      expect(action?.channelState?.isOfferWinner).toBeNull();
    });
  });
});
