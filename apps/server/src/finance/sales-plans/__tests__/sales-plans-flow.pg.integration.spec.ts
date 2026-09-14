import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { SalesPlanViewSchema } from '@kiditem/shared/finance';
import { SalesPlansService } from '../sales-plans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedCompletedOrderCollection,
  seedAd,
  seedCompletedAdSweepRun,
} from '../../../test-helpers/finance-seeds';

describe('Sales-plans flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SalesPlansService;

  async function seedListingFixture(opts: {
    organizationId: string;
    suffix: string;
    costPrice?: number;
  }) {
    const master = await setupMaster(prisma, {
      organizationId: opts.organizationId,
      code: `SP-${opts.suffix}`,
      name: `SalesPlan ${opts.suffix}`,
    });
    const option = await setupProductOption(prisma, {
      organizationId: opts.organizationId,
      masterId: master.id,
      sku: `SP-${opts.suffix}-SKU`,
      costPrice: opts.costPrice,
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: opts.organizationId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `SP-${opts.suffix}-EXT`,
      channelName: `SP ${opts.suffix}`,
      optionId: option.id,
      externalOptionId: `SP-${opts.suffix}-VI`,
    });
    return { master, option, listing };
  }

  const allOrderIds = async (organizationId = TEST_ORGANIZATION_ID) =>
    (await prisma.order.findMany({ where: { organizationId }, select: { id: true } }))
      .map((order) => order.id);

  // The listing endpoint is the only plan view; read one plan out of it.
  const planView = async (id: string, organizationId: string, now: Date) => {
    const view = (await service.findAll(organizationId, now)).find((plan) => plan.id === id);
    if (!view) throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    return view;
  };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        SalesPlansService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(SalesPlansService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  describe('IDOR — cross-organization mutation is blocked', () => {
    it('#1 update: OTHER_COMPANY cannot patch TEST_COMPANY plan → NotFoundException; row unchanged', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
          targetOrders: 10,
          targetProfit: 200_000,
          notes: 'original',
        },
      });

      await expect(
        service.update(plan.id, OTHER_ORGANIZATION_ID, {
          targetRevenue: 9_999_999,
          notes: 'pwned',
        }, AFTER_MONTHS),
      ).rejects.toThrow(NotFoundException);

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.targetRevenue).toBe(1_000_000);
      expect(reread?.notes).toBe('original');
    });

    it('#2 plan list: OTHER_COMPANY cannot read TEST_COMPANY plan actuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });

      const otherPlans = await service.findAll(OTHER_ORGANIZATION_ID, AFTER_MONTHS);
      expect(otherPlans.map(({ id }) => id)).not.toContain(plan.id);
    });

    it('#3 delete: OTHER_COMPANY cannot delete TEST_COMPANY plan → NotFoundException; row still exists', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
        },
      });

      await expect(service.delete(plan.id, OTHER_ORGANIZATION_ID)).rejects.toThrow(
        NotFoundException,
      );

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.id).toBe(plan.id);
    });

    it('#4a create: duplicate-period guard is organizationId-scoped (same period in two organizations coexist)', async () => {
      await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
        },
      });

      const other = await service.create(OTHER_ORGANIZATION_ID, {
        period: '2026-04',
        targetRevenue: 500_000,
      }, AFTER_MONTHS);

      expect(other).toMatchObject({ period: '2026-04', targetRevenue: 500_000 });
      await expect(prisma.salesPlan.findUniqueOrThrow({ where: { id: other.id } }))
        .resolves.toMatchObject({ organizationId: OTHER_ORGANIZATION_ID });
    });

    it('#4 same-organization mutations succeed (baseline sanity)', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
        },
      });

      const updated = await service.update(plan.id, TEST_ORGANIZATION_ID, {
        targetRevenue: 2_000_000,
        notes: 'bumped',
      }, AFTER_MONTHS);
      expect(updated.targetRevenue).toBe(2_000_000);
      expect(updated.notes).toBe('bumped');

      const deleted = await service.delete(plan.id, TEST_ORGANIZATION_ID);
      expect(deleted).toEqual({ ok: true });

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread).toBeNull();
    });
  });

  /**
   * Plan actuals are the month's order-line facts read live, published with
   * the observation time and basis of the reads behind them. Nothing is
   * written back to the plan row.
   */
  describe('actuals — live line facts with an observation time', () => {
    it('#5 reads actuals from live order/ad inputs; cancelled/returned/refunded excluded; nothing stored', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          targetRevenue: 500_000,
        },
      });
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'LIVE',
        costPrice: 5_000,
      });

      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-PAID-1',
        orderedAt: '2026-04-10T03:00:00.000Z',
        shippingPrice: 3_000,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 20_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-PAID-2',
        orderedAt: '2026-04-10T03:30:00.000Z',
        shippingPrice: 0,
        status: 'accepted',
        lineItems: [{
          quantity: 1,
          totalPrice: 10_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await prisma.order.updateMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: { in: ['SP-PAID-1', 'SP-PAID-2'] },
        },
        data: { totalPrice: 999_999 },
      });
      for (const status of ['refunded', 'cancelled', 'returned']) {
        await seedOrderWithLineItems(prisma, {
          orderChannel: 'rocket',
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `SP-${status.toUpperCase()}`,
          orderedAt: '2026-04-10T04:00:00.000Z',
          shippingPrice: 0,
          status,
          lineItems: [{
            quantity: 1,
            totalPrice: 99_999,
            optionId: fixture.option.id,
            listingOptionId: fixture.listing.listingOptionId,
          }],
        });
      }
      const runId = await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-30' },
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: fixture.listing.listingId,
        date: '2026-04-10',
        spend: 2_000,
        runId,
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-30',
        orderIds: await allOrderIds(),
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);

      expect(SalesPlanViewSchema.safeParse(JSON.parse(JSON.stringify(synced))).success).toBe(true);
      expect(synced.actuals).toMatchObject({
        revenue: 30_000,
        orderCount: 2,
        netProfit: 15_000,
      });
      expect(synced.actuals?.observedAt).toBeInstanceOf(Date);
      // KID-85 follow-up P3-13: the server publishes achievement against each
      // target; a zero target has no rate.
      expect(synced.achievement).toEqual({ revenue: 6, orders: null, profit: null });
      for (const basis of [synced.actuals!.basis.revenue, synced.actuals!.basis.profit]) {
        expect(periodBasisStatus(basis)).toBe('complete');
      }
    });

    it('#6 an uncollected month publishes no actuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);

      expect(synced.actuals).toMatchObject({
        revenue: null,
        orderCount: null,
        netProfit: null,
        observedAt: null,
      });
      expect(periodBasisStatus(synced.actuals!.basis.revenue)).toBe('empty');
    });

    it('#6b completed empty coverage publishes measured zero actuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-30', orderIds: [],
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);

      expect(synced.actuals).toMatchObject({ revenue: 0, orderCount: 0, netProfit: 0 });
      expect(periodBasisStatus(synced.actuals!.basis.profit)).toBe('complete');
    });

    it('#7 KST boundary: April and May plans split both order revenue and live profit correctly', async () => {
      const aprilPlan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });
      const mayPlan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-05' },
      });
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'BOUNDARY',
        costPrice: 5_000,
      });

      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-KST-APRIL',
        orderedAt: '2026-04-30T14:30:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 10_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-KST-MAY',
        orderedAt: '2026-04-30T15:30:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 20_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      const runId = await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-05-31' },
      });
      for (const date of ['2026-04-30', '2026-05-01']) {
        await seedAd(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: fixture.listing.listingId,
          date,
          spend: 0,
          runId,
        });
      }
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-05-31',
        orderIds: await allOrderIds(),
      });

      const april = await planView(aprilPlan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);
      expect(april.actuals).toMatchObject({ revenue: 10_000, orderCount: 1, netProfit: 5_000 });

      const may = await planView(mayPlan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);
      expect(may.actuals).toMatchObject({ revenue: 20_000, orderCount: 1, netProfit: 15_000 });
    });

    it('#8 cross-tenant — OTHER_COMPANY orders/ads do not contribute to TEST_COMPANY actuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });
      const ownFixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'OWN',
        costPrice: 5_000,
      });
      const foreignFixture = await seedListingFixture({
        organizationId: OTHER_ORGANIZATION_ID,
        suffix: 'FOREIGN',
        costPrice: 5_000,
      });

      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-OWN',
        orderedAt: '2026-04-10T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 50_000,
          optionId: ownFixture.option.id,
          listingOptionId: ownFixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: OTHER_ORGANIZATION_ID,
        externalOrderId: 'SP-FOREIGN',
        orderedAt: '2026-04-10T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 9_999_999,
          optionId: foreignFixture.option.id,
          listingOptionId: foreignFixture.listing.listingOptionId,
        }],
      });
      const foreignRunId = await seedCompletedAdSweepRun(prisma, {
        organizationId: OTHER_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-30' },
      });
      await seedAd(prisma, {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: foreignFixture.listing.listingId,
        date: '2026-04-10',
        spend: 1_000_000,
        runId: foreignRunId,
      });
      const ownRunId = await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-30' },
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: ownFixture.listing.listingId,
        date: '2026-04-10',
        spend: 0,
        runId: ownRunId,
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-30',
        orderIds: await allOrderIds(),
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, AFTER_MONTHS);
      expect(synced.actuals).toMatchObject({ revenue: 50_000, orderCount: 1, netProfit: 45_000 });
    });

    it('#9 lists every plan newest first with its own live actuals', async () => {
      await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-03', targetRevenue: 1 },
      });
      await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04', targetRevenue: 2 },
      });
      await prisma.salesPlan.create({
        data: { organizationId: OTHER_ORGANIZATION_ID, period: '2026-04', targetRevenue: 3 },
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-30', orderIds: [],
      });

      const plans = await service.findAll(TEST_ORGANIZATION_ID, AFTER_MONTHS);

      expect(plans.map((plan) => [plan.period, plan.targetRevenue])).toEqual([
        ['2026-04', 2],
        ['2026-03', 1],
      ]);
      expect(plans[0].actuals).toMatchObject({ revenue: 0, orderCount: 0, netProfit: 0 });
      expect(plans[1].actuals).toMatchObject({ revenue: null, orderCount: null, netProfit: null });
    });

    it('#10 reads the month containing today over its closed days only', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'MID',
        costPrice: 5_000,
      });
      for (const [externalOrderId, orderedAt, totalPrice] of [
        ['SP-MID-CLOSED', '2026-04-10T03:00:00.000Z', 20_000],
        ['SP-MID-TODAY', '2026-04-15T01:00:00.000Z', 30_000],
      ] as const) {
        await seedOrderWithLineItems(prisma, {
          orderChannel: 'rocket',
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId,
          orderedAt,
          shippingPrice: 0,
          status: 'paid',
          lineItems: [{
            quantity: 1,
            totalPrice,
            optionId: fixture.option.id,
            listingOptionId: fixture.listing.listingOptionId,
          }],
        });
      }
      await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-14' },
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-15',
        orderIds: await allOrderIds(),
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, MID_APRIL);

      expect(synced.actuals).toMatchObject({ revenue: 20_000, orderCount: 1, netProfit: 15_000 });
      expect(synced.actuals!.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
      expect(synced.actuals!.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
    });

    it('#11 publishes no actuals on the 1st, when no day of the month has closed', async () => {
      const plan = await prisma.salesPlan.create({
        data: { organizationId: TEST_ORGANIZATION_ID, period: '2026-04' },
      });
      await seedCompletedOrderCollection(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-04-01', endDate: '2026-04-01', orderIds: [],
      });

      const synced = await planView(plan.id, TEST_ORGANIZATION_ID, APRIL_FIRST);

      expect(synced.actuals).toMatchObject({
        revenue: null, orderCount: null, netProfit: null, observedAt: null,
      });
      expect(synced.actuals!.basis.revenue).toMatchObject({
        from: '2026-04-01', to: '2026-03-31', targetDays: 0,
      });
    });
  });

  /** A moment after every month these cases read has closed in KST. */
  const AFTER_MONTHS = new Date('2026-07-01T00:00:00.000Z');
  /** 12:00 KST on 15 April: 1–14 April are closed. */
  const MID_APRIL = new Date('2026-04-15T03:00:00.000Z');
  /** 12:00 KST on 1 April: no April day is closed. */
  const APRIL_FIRST = new Date('2026-04-01T03:00:00.000Z');
});
