import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { SettlementsService } from '../settlements.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../test-helpers/finance-seeds';

describe('Settlements flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SettlementsService;

  async function seedListingFixture(opts: {
    companyId: string;
    suffix: string;
    costPrice?: number;
    commissionRate?: number;
    otherCost?: number;
  }) {
    const master = await setupMaster(prisma, {
      companyId: opts.companyId,
      code: `SET-${opts.suffix}`,
      name: `Settlement ${opts.suffix}`,
    });
    const option = await setupProductOption(prisma, {
      companyId: opts.companyId,
      masterId: master.id,
      sku: `SET-${opts.suffix}-SKU`,
      costPrice: opts.costPrice,
      commissionRate: opts.commissionRate,
      otherCost: opts.otherCost,
    });
    const listing = await setupChannelListing(prisma, {
      companyId: opts.companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `SET-${opts.suffix}-EXT`,
      channelName: `SET ${opts.suffix}`,
      optionId: option.id,
      vendorItemId: `SET-${opts.suffix}-VI`,
    });
    return { master, option, listing };
  }

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
        companyId: TEST_COMPANY_ID,
        suffix: 'LIVE',
        costPrice: 5_000,
        commissionRate: 0.1,
        otherCost: 500,
      });

      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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
      await seedAd(prisma, {
        companyId: TEST_COMPANY_ID,
        listingId: fixture.listing.listingId,
        date: '2026-03-15T00:00:00.000Z',
        spend: 2_000,
      });

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

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
      expect(result.summary).toEqual(expect.objectContaining({
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
      }));
    });
  });

  describe('reconcile — KST month boundary', () => {
    it('#2 2026-03-31 23:30 KST is included in March, not April', async () => {
      const fixture = await seedListingFixture({
        companyId: TEST_COMPANY_ID,
        suffix: 'MARCH',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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

      const march = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      const april = await service.reconcile(TEST_COMPANY_ID, '2026-04');

      expect(march.details).toHaveLength(1);
      expect(march.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
      expect(april.details).toEqual([]);
      expect(april.summary.totalPlRevenue).toBe(0);
      expect(april.summary.totalOrderRevenue).toBe(0);
    });

    it('#3 2026-04-01 00:30 KST is included in April, not March', async () => {
      const fixture = await seedListingFixture({
        companyId: TEST_COMPANY_ID,
        suffix: 'APRIL',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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

      const march = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      const april = await service.reconcile(TEST_COMPANY_ID, '2026-04');

      expect(march.details).toEqual([]);
      expect(april.details).toHaveLength(1);
      expect(april.details[0]).toEqual(expect.objectContaining({
        listingId: fixture.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
    });
  });

  describe('reconcile — excluded statuses and tenant isolation', () => {
    it('#4 cancelled, returned, and refunded orders are excluded from both live and SQL sides', async () => {
      const fixture = await seedListingFixture({
        companyId: TEST_COMPANY_ID,
        suffix: 'FILTER',
        costPrice: 2_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
        externalOrderId: 'SET-CANCELLED',
        orderedAt: '2026-03-15T03:05:00.000Z',
        shippingPrice: 0,
        status: 'cancelled',
        lineItems: [{
          quantity: 1,
          totalPrice: 50_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
        externalOrderId: 'SET-RETURNED',
        orderedAt: '2026-03-15T03:10:00.000Z',
        shippingPrice: 0,
        status: 'returned',
        lineItems: [{
          quantity: 1,
          totalPrice: 40_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
        externalOrderId: 'SET-REFUNDED',
        orderedAt: '2026-03-15T03:15:00.000Z',
        shippingPrice: 0,
        status: 'refunded',
        lineItems: [{
          quantity: 1,
          totalPrice: 30_000,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

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

    it('#5 other-company rows do not appear in the TEST company reconcile', async () => {
      const own = await seedListingFixture({
        companyId: TEST_COMPANY_ID,
        suffix: 'OWN',
        costPrice: 1_000,
        commissionRate: 0.1,
      });
      const foreign = await seedListingFixture({
        companyId: OTHER_COMPANY_ID,
        suffix: 'FOREIGN',
        costPrice: 1_000,
        commissionRate: 0.1,
      });

      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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
        companyId: OTHER_COMPANY_ID,
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

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual(expect.objectContaining({
        listingId: own.listing.listingId,
        plRevenue: 5_000,
        orderTotal: 5_000,
      }));
      expect(result.details[0].listingId).not.toBe(foreign.listing.listingId);
      expect(result.summary.totalPlRevenue).toBe(5_000);
      expect(result.summary.totalOrderRevenue).toBe(5_000);
    });
  });

  describe('update — IDOR protection', () => {
    it('#6 cross-company update throws BadRequestException', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      await expect(
        service.update(settlement.id, OTHER_COMPANY_ID, { actualAmount: 99_999_999 }),
      ).rejects.toThrow(BadRequestException);

      const reread = await prisma.settlement.findUnique({ where: { id: settlement.id } });
      expect(reread?.actualAmount).toBe(0);
    });

    it('#7 same-company update succeeds', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      const updated = await service.update(settlement.id, TEST_COMPANY_ID, {
        actualAmount: 980_000,
        status: 'confirmed',
      });

      expect(updated.actualAmount).toBe(980_000);
      expect(updated.status).toBe('confirmed');
    });
  });
});
