import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { SettlementsService } from '../settlements.service';
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
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../../test-helpers/finance-seeds';
import { readSettlements } from '../read/settlement-facts';

describe('Settlements flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SettlementsService;

  async function seedListingFixture(opts: {
    organizationId: string;
    suffix: string;
    costPrice?: number;
    commissionRate?: number;
    otherCost?: number;
  }) {
    const master = await setupMaster(prisma, {
      organizationId: opts.organizationId,
      code: `SET-${opts.suffix}`,
      name: `Settlement ${opts.suffix}`,
    });
    const option = await setupProductOption(prisma, {
      organizationId: opts.organizationId,
      masterId: master.id,
      sku: `SET-${opts.suffix}-SKU`,
      costPrice: opts.costPrice,
      commissionRate: opts.commissionRate,
      otherCost: opts.otherCost,
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: opts.organizationId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `SET-${opts.suffix}-EXT`,
      channelName: `SET ${opts.suffix}`,
      optionId: option.id,
      externalOptionId: `SET-${opts.suffix}-VI`,
    });
    return { master, option, listing };
  }

  /** The Orders collection declares it collected these KST dates. */
  const coverOrders = (
    startDate = '2026-03-01',
    endDate = '2026-03-31',
    organizationId = TEST_ORGANIZATION_ID,
  ) => seedCompletedOrderCoverageRun(prisma, { organizationId, startDate, endDate });

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(SettlementsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  describe('reconcile — live matched path', () => {
    it('#1 builds the PL-side fields from live revenue/cost inputs', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'LIVE',
        costPrice: 5_000,
        commissionRate: 0.1,
        otherCost: 500,
      });

      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-ORD-1',
        orderedAt: '2026-03-15T00:00:00.000Z',
        shippingPrice: 3_000,
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
        window: { startDate: '2026-03-01', endDate: '2026-03-31' },
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: fixture.listing.listingId,
        date: '2026-03-15',
        spend: 2_000,
        runId,
      });
      await coverOrders();

      const result = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);

      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        externalId: 'SET-LIVE-EXT',
        channelName: 'SET LIVE',
        masterCode: 'SET-LIVE',
        masterName: 'Settlement LIVE',
        plRevenue: 20_000,
        plCommission: 2_000,
        plNetProfit: 7_500,
        plOrderCount: 1,
        orderTotal: 20_000,
        orderCount: 1,
        revenueDiff: 0,
        isMatched: true,
        status: 'matched',
      }));
      expect(result.summary).toEqual({
        totalPlRevenue: 20_000,
        totalOrderRevenue: 20_000,
        totalCommission: 2_000,
        totalShipping: 3_000,
        revenueDifference: 0,
        productCount: 1,
        orderCount: 1,
        matchedCount: 1,
        mismatchCount: 0,
        matchRate: 100,
      });
      for (const basis of [result.basis.revenue, result.basis.adCost, result.basis.profit]) {
        expect(periodBasisStatus(basis)).toBe('complete');
      }
    });
  });

  describe('reconcile — KST month boundary', () => {
    it('#2 2026-03-31 23:30 KST is included in March, not April', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'MARCH',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-KST-MARCH',
        orderedAt: '2026-03-31T14:30:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 5_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await coverOrders('2026-03-01', '2026-04-30');

      const march = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);
      const april = await service.reconcile(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

      expect(march.details).toHaveLength(1);
      expect(march.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
      expect(april.details).toEqual([]);
      // A collected month without orders is a measured zero, and a match rate
      // over no products is not a number.
      expect(april.summary).toMatchObject({
        totalPlRevenue: 0,
        totalOrderRevenue: 0,
        productCount: 0,
        matchRate: null,
      });
    });

    it('#3 2026-04-01 00:30 KST is included in April, not March', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'APRIL',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-KST-APRIL',
        orderedAt: '2026-03-31T15:30:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 5_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await coverOrders('2026-03-01', '2026-04-30');

      const march = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);
      const april = await service.reconcile(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

      expect(march.details).toEqual([]);
      expect(april.details).toHaveLength(1);
      expect(april.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
    });

    it('#3b a month no Orders collection covered publishes no totals and no match rate', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'UNCOVERED',
        costPrice: 1_000,
        commissionRate: 0.1,
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-UNCOVERED',
        orderedAt: '2026-03-15T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 5_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });

      const result = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);

      expect(result.details).toEqual([]);
      expect(result.summary).toEqual({
        totalPlRevenue: null,
        totalOrderRevenue: null,
        totalCommission: null,
        totalShipping: null,
        revenueDifference: null,
        productCount: 0,
        orderCount: null,
        matchedCount: 0,
        mismatchCount: 0,
        matchRate: null,
      });
      expect(result.basis.revenue.includedDates).toEqual([]);
    });

    it('#3c evaluates the month containing today over its closed days, and none on the 1st', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'CURRENT',
        costPrice: 1_000,
        commissionRate: 0.1,
      });
      for (const [externalOrderId, orderedAt] of [
        ['SET-CURRENT-CLOSED', '2026-04-10T03:00:00.000Z'],
        ['SET-CURRENT-TODAY', '2026-04-15T01:00:00.000Z'],
      ] as const) {
        await seedOrderWithLineItems(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId,
          orderedAt,
          shippingPrice: 0,
          status: 'paid',
          lineItems: [{
            quantity: 1,
            totalPrice: 5_000,
            optionId: fixture.option.id,
            listingOptionId: fixture.listing.listingOptionId,
          }],
        });
      }
      await coverOrders('2026-04-01', '2026-04-15');

      const midMonth = await service.reconcile(TEST_ORGANIZATION_ID, '2026-04', MID_APRIL);
      const firstDay = await service.reconcile(TEST_ORGANIZATION_ID, '2026-04', APRIL_FIRST);

      expect(midMonth.details).toEqual([
        expect.objectContaining({ plRevenue: 5_000, orderTotal: 5_000, orderCount: 1 }),
      ]);
      expect(midMonth.summary).toMatchObject({
        totalPlRevenue: 5_000, totalOrderRevenue: 5_000, orderCount: 1, matchRate: 100,
      });
      expect(midMonth.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
      expect(midMonth.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });

      expect(firstDay.details).toEqual([]);
      expect(firstDay.summary).toMatchObject({
        totalPlRevenue: null, totalOrderRevenue: null, orderCount: null, matchRate: null,
      });
      expect(firstDay.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-03-31', targetDays: 0 });
    });
  });

  /** A moment after every month these cases read has closed in KST. */
  const AFTER_MONTHS = new Date('2026-07-01T00:00:00.000Z');
  /** 12:00 KST on 15 April: 1–14 April are closed. */
  const MID_APRIL = new Date('2026-04-15T03:00:00.000Z');
  /** 12:00 KST on 1 April: no April day is closed. */
  const APRIL_FIRST = new Date('2026-04-01T03:00:00.000Z');

  describe('reconcile — excluded statuses and tenant isolation', () => {
    it('#4 cancelled, returned, and refunded orders are excluded from both live and order sides', async () => {
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'FILTER',
        costPrice: 2_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-KEEP',
        orderedAt: '2026-03-15T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 10_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      for (const [status, totalPrice] of [['cancelled', 50_000], ['returned', 40_000], ['refunded', 30_000]] as const) {
        await seedOrderWithLineItems(prisma, {
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `SET-${status.toUpperCase()}`,
          orderedAt: '2026-03-15T03:05:00.000Z',
          shippingPrice: 0,
          status,
          lineItems: [{
            quantity: 1,
            totalPrice,
            optionId: fixture.option.id,
            listingOptionId: fixture.listing.listingOptionId,
          }],
        });
      }
      await coverOrders();

      const result = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);

      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        plRevenue: 10_000,
        plOrderCount: 1,
        orderTotal: 10_000,
        orderCount: 1,
        status: 'matched',
      }));
      expect(result.summary.totalPlRevenue).toBe(10_000);
      expect(result.summary.totalOrderRevenue).toBe(10_000);
      expect(result.summary.orderCount).toBe(1);
    });

    it('#5 other-organization rows do not appear in the TEST organization reconcile', async () => {
      const own = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'OWN',
        costPrice: 1_000,
        commissionRate: 0.1,
      });
      const foreign = await seedListingFixture({
        organizationId: OTHER_ORGANIZATION_ID,
        suffix: 'FOREIGN',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SET-OWN-1',
        orderedAt: '2026-03-15T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 5_000,
          optionId: own.option.id,
          listingOptionId: own.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: OTHER_ORGANIZATION_ID,
        externalOrderId: 'SET-FOREIGN-1',
        orderedAt: '2026-03-15T03:00:00.000Z',
        shippingPrice: 0,
        status: 'paid',
        lineItems: [{
          quantity: 1,
          totalPrice: 999_999,
          optionId: foreign.option.id,
          listingOptionId: foreign.listing.listingOptionId,
        }],
      });
      await coverOrders();
      await coverOrders(undefined, undefined, OTHER_ORGANIZATION_ID);

      const result = await service.reconcile(TEST_ORGANIZATION_ID, '2026-03', AFTER_MONTHS);

      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual(expect.objectContaining({
        listingId: own.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
      expect(result.summary.totalPlRevenue).toBe(5_000);
      expect(result.summary.totalOrderRevenue).toBe(5_000);
    });
  });

  describe('update — IDOR protection', () => {
    it('#6 cross-organization update throws BadRequestException', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      await expect(
        service.update(settlement.id, OTHER_ORGANIZATION_ID, { actualAmount: 99_999_999 }),
      ).rejects.toThrow(BadRequestException);

      const reread = await prisma.settlement.findUnique({ where: { id: settlement.id } });
      expect(reread?.actualAmount).toBe(0);
    });

    it('#7 same-organization confirmation publishes the actual amount and its difference', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      const updated = await service.update(settlement.id, TEST_ORGANIZATION_ID, {
        actualAmount: 980_000,
        status: 'confirmed',
      });

      expect(updated).toMatchObject({
        actualAmount: 980_000,
        status: 'confirmed',
        expectedAmount: 1_000_000,
        difference: -20_000,
      });
    });

    it('#7b refuses to confirm a settlement without the deposited amount', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      // The stored actual column defaults to 0; confirming it would publish a
      // deposit nobody entered.
      await expect(
        service.update(settlement.id, TEST_ORGANIZATION_ID, { status: 'confirmed' }),
      ).rejects.toThrow(BadRequestException);

      await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03')).resolves.toEqual([
        expect.objectContaining({ status: 'pending', actualAmount: null, difference: null }),
      ]);
      await expect(service.update(settlement.id, TEST_ORGANIZATION_ID, {
        status: 'confirmed',
        actualAmount: 0,
      })).resolves.toMatchObject({ status: 'confirmed', actualAmount: 0, difference: -1_000_000 });
    });

    it('#8 missing settlement uses the same public not-found contract', async () => {
      await expect(service.update(
        '00000000-0000-4000-8000-000000000099',
        TEST_ORGANIZATION_ID,
        { actualAmount: 1 },
      )).rejects.toThrow(BadRequestException);
    });
  });

  it('reads the Finance-owned settlement ledger with period and organization scope', async () => {
    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 100,
      shippingFee: 50, orderCount: 2, returnCount: 0,
    });
    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-04', expectedAmount: 2_000, commission: 200,
      shippingFee: 75, orderCount: 3, returnCount: 1,
    });
    await service.create(OTHER_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 999_999, commission: 0,
      shippingFee: 0, orderCount: 1, returnCount: 0,
    });

    await expect(prisma.$transaction((tx) => readSettlements(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      period: '2026',
    }))).resolves.toEqual([
      expect.objectContaining({ period: '2026-04', expectedAmount: 2_000 }),
      expect.objectContaining({ period: '2026-03', expectedAmount: 1_000 }),
    ]);
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03')).resolves.toEqual([
      expect.objectContaining({ period: '2026-03', expectedAmount: 1_000 }),
    ]);
    await expect(service.findAll(TEST_ORGANIZATION_ID, '')).resolves.toHaveLength(2);
  });

  it('publishes no actual amount or difference for a settlement nobody confirmed', async () => {
    const created = await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 100,
      shippingFee: 50, orderCount: 2, returnCount: 0,
    });

    // The stored actual column defaults to 0; an unconfirmed deposit is not
    // a deposit of zero.
    expect(created).toMatchObject({ status: 'pending', actualAmount: null, difference: null });
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03')).resolves.toEqual([
      expect.objectContaining({ actualAmount: null, difference: null }),
    ]);
  });
});
