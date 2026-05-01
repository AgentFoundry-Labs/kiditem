import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
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
  seedAd,
} from '../../../test-helpers/finance-seeds';

describe('Sales-plans flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SalesPlansService;

  async function seedListingFixture(opts: {
    organizationId: string;
    suffix: string;
    costPrice?: number;
    commissionRate?: number;
    otherCost?: number;
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
      commissionRate: opts.commissionRate,
      otherCost: opts.otherCost,
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
        }),
      ).rejects.toThrow(NotFoundException);

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.targetRevenue).toBe(1_000_000);
      expect(reread?.notes).toBe('original');
    });

    it('#2 syncActuals: OTHER_COMPANY cannot sync TEST_COMPANY plan → NotFoundException; actuals unchanged', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
          actualRevenue: 500_000,
          actualOrders: 5,
          actualProfit: 100_000,
        },
      });

      await expect(service.syncActuals(plan.id, OTHER_ORGANIZATION_ID)).rejects.toThrow(
        NotFoundException,
      );

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.actualRevenue).toBe(500_000);
      expect(reread?.actualOrders).toBe(5);
      expect(reread?.actualProfit).toBe(100_000);
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
      expect(reread).not.toBeNull();
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

      // OTHER_COMPANY can still create the same period — guard scoped to organizationId.
      const other = await service.create(OTHER_ORGANIZATION_ID, {
        period: '2026-04',
        targetRevenue: 500_000,
      } as any);

      expect(other.organizationId).toBe(OTHER_ORGANIZATION_ID);
      expect(other.period).toBe('2026-04');
      expect(other.targetRevenue).toBe(500_000);
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
      });
      expect(updated.targetRevenue).toBe(2_000_000);
      expect(updated.notes).toBe('bumped');

      const deleted = await service.delete(plan.id, TEST_ORGANIZATION_ID);
      expect(deleted).toEqual({ ok: true });

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread).toBeNull();
    });
  });

  describe('syncActuals — live actuals + KST month boundary', () => {
    it('#5 computes actuals from live order/ad inputs; cancelled/returned/refunded excluded', async () => {
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
        commissionRate: 0.1,
        otherCost: 500,
      });

      await seedOrderWithLineItems(prisma, {
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
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-REFUNDED',
        orderedAt: '2026-04-10T04:00:00.000Z',
        shippingPrice: 0,
        status: 'refunded',
        lineItems: [{
          quantity: 1,
          totalPrice: 99_999,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-CANCELLED',
        orderedAt: '2026-04-10T04:10:00.000Z',
        shippingPrice: 0,
        status: 'cancelled',
        lineItems: [{
          quantity: 1,
          totalPrice: 99_999,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-RETURNED',
        orderedAt: '2026-04-10T04:20:00.000Z',
        shippingPrice: 0,
        status: 'returned',
        lineItems: [{
          quantity: 1,
          totalPrice: 99_999,
          optionId: fixture.option.id,
          listingOptionId: fixture.listing.listingOptionId,
        }],
      });
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: fixture.listing.listingId,
        date: '2026-04-10',
        spend: 2_000,
      });

      const synced = await service.syncActuals(plan.id, TEST_ORGANIZATION_ID);

      expect(synced.actualRevenue).toBe(30_000);
      expect(synced.actualOrders).toBe(2);
      expect(synced.actualProfit).toBe(11_000);
    });

    it('#6 empty state — no orders, no ads → actuals default to 0', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
        },
      });

      const synced = await service.syncActuals(plan.id, TEST_ORGANIZATION_ID);

      expect(synced.actualRevenue).toBe(0);
      expect(synced.actualOrders).toBe(0);
      expect(synced.actualProfit).toBe(0);
    });

    it('#7 KST boundary: April and May plans split both order revenue and live profit correctly', async () => {
      const aprilPlan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
        },
      });
      const mayPlan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-05',
        },
      });
      const fixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'BOUNDARY',
        costPrice: 5_000,
        commissionRate: 0.1,
        otherCost: 0,
      });

      await seedOrderWithLineItems(prisma, {
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

      const apriled = await service.syncActuals(aprilPlan.id, TEST_ORGANIZATION_ID);
      expect(apriled.actualRevenue).toBe(10_000);
      expect(apriled.actualOrders).toBe(1);
      expect(apriled.actualProfit).toBe(4_000);

      const mayed = await service.syncActuals(mayPlan.id, TEST_ORGANIZATION_ID);
      expect(mayed.actualRevenue).toBe(20_000);
      expect(mayed.actualOrders).toBe(1);
      expect(mayed.actualProfit).toBe(13_000);
    });

    it('#8 cross-tenant — OTHER_COMPANY orders/ads do not contribute to TEST_COMPANY syncActuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-04',
        },
      });
      const ownFixture = await seedListingFixture({
        organizationId: TEST_ORGANIZATION_ID,
        suffix: 'OWN',
        costPrice: 5_000,
        commissionRate: 0.1,
        otherCost: 0,
      });
      const foreignFixture = await seedListingFixture({
        organizationId: OTHER_ORGANIZATION_ID,
        suffix: 'FOREIGN',
        costPrice: 5_000,
        commissionRate: 0.1,
        otherCost: 0,
      });

      await seedOrderWithLineItems(prisma, {
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
      await seedAd(prisma, {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: foreignFixture.listing.listingId,
        date: '2026-04-10',
        spend: 1_000_000,
      });

      const synced = await service.syncActuals(plan.id, TEST_ORGANIZATION_ID);
      expect(synced.actualRevenue).toBe(50_000);
      expect(synced.actualOrders).toBe(1);
      expect(synced.actualProfit).toBe(40_000);
    });
  });
});
