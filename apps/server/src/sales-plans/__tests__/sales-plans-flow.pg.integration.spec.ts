import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { SalesPlansService } from '../sales-plans.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

/**
 * Plan B2c.orders T13 — sales-plans-flow.pg integration spec.
 *
 * v2 review 에서 required 로 승격된 regression 가드. T9 에서 update/syncActuals/delete 3 methods
 * 에 IDOR fix (findFirst({id, companyId})) + @CurrentCompany controller 주입을 도입했으므로,
 * cross-company 호출이 **정확히 NotFoundException** 을 던지는지 DB 왕복으로 증명한다.
 *
 * 5 invariants (real-Postgres 로만 검증 가능한 것):
 *   - IDOR update — OTHER_COMPANY_ID 가 TEST_COMPANY_ID 의 plan 을 update 시도 → NotFound.
 *   - IDOR syncActuals — 동일. DB 의 SalesPlan row 는 그대로.
 *   - IDOR delete — 동일. row 는 delete 되지 않음.
 *   - syncActuals KST 월 경계 — Order @ 2026-04-30 14:30Z (KST 23:30 April) → April bucket.
 *                              Order @ 2026-04-30 15:30Z (KST 2026-05-01 00:30) → May bucket, April actual 에서 제외.
 *   - syncActuals totalPrice aggregate — Order.totalPrice sum + ProfitLoss.netProfit sum 정확성.
 *                                        cancelled/returned 제외 + empty case 는 0 으로 안전히 떨어짐.
 */

describe('Sales-plans flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SalesPlansService;

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

  // ---------------------------------------------------------------------------
  // IDOR 3 methods — cross-company mutation 시도는 NotFoundException + row 불변.
  // ---------------------------------------------------------------------------
  describe('IDOR — cross-company mutation is blocked', () => {
    it('#1 update: OTHER_COMPANY cannot patch TEST_COMPANY plan → NotFoundException; row unchanged', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
          targetOrders: 10,
          targetProfit: 200_000,
          notes: 'original',
        },
      });

      await expect(
        service.update(plan.id, OTHER_COMPANY_ID, {
          targetRevenue: 9_999_999,
          notes: 'pwned',
        }),
      ).rejects.toThrow(NotFoundException);

      // Row invariant: 원본 필드 그대로
      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.targetRevenue).toBe(1_000_000);
      expect(reread?.notes).toBe('original');
    });

    it('#2 syncActuals: OTHER_COMPANY cannot sync TEST_COMPANY plan → NotFoundException; actuals unchanged', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
          actualRevenue: 500_000, // pre-existing actuals that must NOT be overwritten
          actualOrders: 5,
          actualProfit: 100_000,
        },
      });

      await expect(
        service.syncActuals(plan.id, OTHER_COMPANY_ID),
      ).rejects.toThrow(NotFoundException);

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread?.actualRevenue).toBe(500_000);
      expect(reread?.actualOrders).toBe(5);
      expect(reread?.actualProfit).toBe(100_000);
    });

    it('#3 delete: OTHER_COMPANY cannot delete TEST_COMPANY plan → NotFoundException; row still exists', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
        },
      });

      await expect(
        service.delete(plan.id, OTHER_COMPANY_ID),
      ).rejects.toThrow(NotFoundException);

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread).not.toBeNull();
      expect(reread?.id).toBe(plan.id);
    });

    it('#4 same-company mutations succeed (baseline sanity)', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
          targetRevenue: 1_000_000,
        },
      });

      const updated = await service.update(plan.id, TEST_COMPANY_ID, {
        targetRevenue: 2_000_000,
        notes: 'bumped',
      });
      expect(updated.targetRevenue).toBe(2_000_000);
      expect(updated.notes).toBe('bumped');

      const deleted = await service.delete(plan.id, TEST_COMPANY_ID);
      expect(deleted).toEqual({ ok: true });

      const reread = await prisma.salesPlan.findUnique({ where: { id: plan.id } });
      expect(reread).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // syncActuals — aggregate 정확성 + KST 월 경계.
  // ---------------------------------------------------------------------------
  describe('syncActuals — aggregate + KST month boundary', () => {
    it('#5 totalPrice sum across paid orders + ProfitLoss.netProfit sum; cancelled/returned excluded', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
          targetRevenue: 500_000,
        },
      });

      // 3 orders in April KST — 2 paid + 1 cancelled (excluded from aggregate)
      // April KST 경계: kstMonthStart(2026, 4) = UTC 2026-03-31 15:00
      //                kstMonthStart(2026, 5) = UTC 2026-04-30 15:00
      // orderedAt 2026-04-10 03:00Z (KST 12:00 April 10) — safely in April bucket.
      const orderedAt = new Date(Date.UTC(2026, 3, 10, 3, 0, 0));
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-PAID-1',
          orderedAt,
          status: 'paid',
          totalPrice: 100_000,
        },
      });
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-PAID-2',
          orderedAt,
          status: 'delivered',
          totalPrice: 250_000,
        },
      });
      // Cancelled — excluded
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-CANCELLED',
          orderedAt,
          status: 'cancelled',
          totalPrice: 99_999,
        },
      });
      // Returned — excluded
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-RETURNED',
          orderedAt,
          status: 'returned',
          totalPrice: 99_999,
        },
      });

      // ProfitLoss fixture — April rows for netProfit aggregate.
      // Seed 2 listings so PL.listingId FK is satisfied.
      const master = await prisma.masterProduct.create({
        data: {
          companyId: TEST_COMPANY_ID,
          code: 'SP-M1',
          name: 'Sync Master',
          optionCounter: 0,
        },
      });
      const listing1 = await prisma.channelListing.create({
        data: {
          companyId: TEST_COMPANY_ID,
          masterId: master.id,
          channel: 'coupang',
          externalId: 'SP-EXT-1',
          channelName: 'SP L1',
        },
      });
      const listing2 = await prisma.channelListing.create({
        data: {
          companyId: TEST_COMPANY_ID,
          masterId: master.id,
          channel: 'coupang',
          externalId: 'SP-EXT-2',
          channelName: 'SP L2',
        },
      });
      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing1.id,
          year: 2026,
          month: 4,
          revenue: 200_000,
          netProfit: 40_000,
          orderCount: 1,
        },
      });
      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing2.id,
          year: 2026,
          month: 4,
          revenue: 150_000,
          netProfit: 30_000,
          orderCount: 1,
        },
      });
      // March PL — filtered out by year/month
      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing1.id,
          year: 2026,
          month: 3,
          revenue: 500_000,
          netProfit: 100_000,
          orderCount: 5,
        },
      });

      const synced = await service.syncActuals(plan.id, TEST_COMPANY_ID);

      // Order aggregate: 100_000 + 250_000 = 350_000 (cancelled + returned excluded)
      expect(synced.actualRevenue).toBe(350_000);
      // _count.id: 2 non-cancelled/returned orders
      expect(synced.actualOrders).toBe(2);
      // PL.netProfit sum (April only): 40_000 + 30_000 = 70_000
      expect(synced.actualProfit).toBe(70_000);
    });

    it('#6 empty state — no orders, no PL → actuals default to 0', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
        },
      });

      const synced = await service.syncActuals(plan.id, TEST_COMPANY_ID);

      expect(synced.actualRevenue).toBe(0);
      expect(synced.actualOrders).toBe(0);
      expect(synced.actualProfit).toBe(0);
    });

    it('#7 KST boundary: Order @ 2026-04-30 14:30Z (KST 23:30 Apr 30) in April bucket; Order @ 2026-04-30 15:30Z (KST 2026-05-01 00:30) excluded from April', async () => {
      // April plan
      const aprilPlan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
        },
      });
      // May plan
      const mayPlan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-05',
        },
      });

      // In-April order: UTC 2026-04-30 14:30 (KST 2026-04-30 23:30) → in April bucket.
      // kstMonthStart(2026, 5) = UTC 2026-04-30 15:00 → this order < boundary → April.
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-KST-APRIL',
          orderedAt: new Date(Date.UTC(2026, 3, 30, 14, 30, 0)),
          status: 'paid',
          totalPrice: 10_000,
        },
      });

      // In-May order: UTC 2026-04-30 15:30 (KST 2026-05-01 00:30) → in May bucket.
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-KST-MAY',
          orderedAt: new Date(Date.UTC(2026, 3, 30, 15, 30, 0)),
          status: 'paid',
          totalPrice: 20_000,
        },
      });

      const apriled = await service.syncActuals(aprilPlan.id, TEST_COMPANY_ID);
      expect(apriled.actualRevenue).toBe(10_000);
      expect(apriled.actualOrders).toBe(1);

      const mayed = await service.syncActuals(mayPlan.id, TEST_COMPANY_ID);
      expect(mayed.actualRevenue).toBe(20_000);
      expect(mayed.actualOrders).toBe(1);
    });

    it('#8 cross-tenant — OTHER_COMPANY orders do not contribute to TEST_COMPANY syncActuals', async () => {
      const plan = await prisma.salesPlan.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-04',
        },
      });

      const orderedAt = new Date(Date.UTC(2026, 3, 10, 3, 0, 0));
      // Own company order — contributes
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-OWN',
          orderedAt,
          status: 'paid',
          totalPrice: 50_000,
        },
      });
      // Foreign company order — MUST be excluded
      await prisma.order.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'SP-FOREIGN',
          orderedAt,
          status: 'paid',
          totalPrice: 9_999_999,
        },
      });

      const synced = await service.syncActuals(plan.id, TEST_COMPANY_ID);
      expect(synced.actualRevenue).toBe(50_000);
      expect(synced.actualOrders).toBe(1);
    });
  });
});
