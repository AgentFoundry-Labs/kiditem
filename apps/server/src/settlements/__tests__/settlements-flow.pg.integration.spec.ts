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

/**
 * Plan B2c.orders T8 Step 8.7 — settlements.reconcile int32 overflow fixture.
 *
 * $queryRaw 의 `SUM(total_price)::bigint` 경로를 실제 Postgres 에서 검증.
 * 대형 셀러 시나리오: 단일 listing 에 lineItem 30개 × unitPrice 100,000,000 KRW
 * = 3,000,000,000 KRW (> 2^31 = 2,147,483,647). int4 캐스트 였으면 overflow.
 */
describe('Settlements flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SettlementsService;

  async function seedListing(params: {
    companyId: string;
    suffix: string;
    channelName?: string;
  }) {
    const master = await prisma.masterProduct.create({
      data: {
        companyId: params.companyId,
        code: `M-${params.suffix}`,
        name: `Master ${params.suffix}`,
        optionCounter: 1,
      },
    });
    const option = await prisma.productOption.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        optionName: `Opt ${params.suffix}`,
        sku: `${master.code}-001`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: `EXT-${params.suffix}`,
        channelName: params.channelName ?? `Channel ${params.suffix}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        companyId: params.companyId,
        listingId: listing.id,
        optionId: option.id,
        vendorItemId: `VI-${params.suffix}`,
      },
    });
    return { master, option, listing, listingOption };
  }

  async function seedOrderWithLine(params: {
    companyId: string;
    listingOptionId: string;
    externalOrderId: string;
    orderedAt: Date;
    unitPrice: number;
    quantity: number;
    status?: string;
  }) {
    const totalPrice = params.unitPrice * params.quantity;
    const order = await prisma.order.create({
      data: {
        companyId: params.companyId,
        platform: 'coupang',
        externalOrderId: params.externalOrderId,
        orderedAt: params.orderedAt,
        status: params.status ?? 'paid',
        totalPrice,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: params.companyId,
        orderId: order.id,
        listingOptionId: params.listingOptionId,
        quantity: params.quantity,
        unitPrice: params.unitPrice,
        totalPrice,
      },
    });
    return order;
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

  describe('reconcile — int32 overflow (bigint SUM)', () => {
    it('#1 30 lineItems × 100,000,000 = 3,000,000,000 (> 2^31) — SUM::bigint safe, Number() round-trip exact', async () => {
      // Core invariant: `SUM(oli.total_price)::bigint` 가 Postgres int4 overflow 없이
      // 3,000,000,000 (> 2^31) 을 반환해야 한다. `::int` 캐스트였다면 overflow.
      // ProfitLoss.revenue 는 int4 스키마라 2,000,000,000 까지만 저장 (자연스럽게 mismatch 로 검증).
      const { listing, listingOption } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'BIG',
      });

      // PL revenue 는 int4 범위 내 (2,000,000,000) — order aggregate 와 큰 차이 → mismatch
      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          year: 2026,
          month: 3,
          revenue: 2_000_000_000,
          orderCount: 30,
        },
      });

      // 30 orders × unitPrice 100,000,000 KRW 각 (1 lineItem/order)
      // 개별 unitPrice 는 int4 범위 내 (1억 < 2.1억), SUM 이 3,000,000,000 > 2^31
      // ordered_at: 2026-03-15 00:00:00 UTC (KST 2026-03-15 09:00) — March KST 월 경계 내
      const orderedAt = new Date(Date.UTC(2026, 2, 15, 0, 0, 0));
      for (let i = 0; i < 30; i++) {
        await seedOrderWithLine({
          companyId: TEST_COMPANY_ID,
          listingOptionId: listingOption.id,
          externalOrderId: `ORD-BIG-${i.toString().padStart(3, '0')}`,
          orderedAt,
          unitPrice: 100_000_000,
          quantity: 1,
        });
      }

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

      expect(result.details).toHaveLength(1);
      const detail = result.details[0];
      // 핵심: SUM::bigint 가 3,000,000,000 을 overflow 없이 반환 + Number() 정확 변환
      expect(typeof detail.orderTotal).toBe('number');
      expect(detail.orderTotal).toBe(3_000_000_000);
      expect(detail.orderCount).toBe(30);
      // PL revenue (2B) vs order total (3B) → 1B diff → mismatch
      expect(detail.plRevenue).toBe(2_000_000_000);
      expect(detail.revenueDiff).toBe(-1_000_000_000);
      expect(detail.status).toBe('mismatch');

      expect(result.summary.totalOrderRevenue).toBe(3_000_000_000);
      expect(result.summary.orderCount).toBe(30);
    });
  });

  describe('reconcile — tolerance bands', () => {
    it('#2 matched / minor_diff / mismatch 3 bands produce expected summary counts', async () => {
      const { listing: lA, listingOption: loA } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'A',
      });
      const { listing: lB, listingOption: loB } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'B',
      });
      const { listing: lC, listingOption: loC } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'C',
      });

      // PL: each revenue 10,000
      for (const l of [lA, lB, lC]) {
        await prisma.profitLoss.create({
          data: {
            companyId: TEST_COMPANY_ID,
            listingId: l.id,
            year: 2026,
            month: 3,
            revenue: 10_000,
            orderCount: 1,
          },
        });
      }

      const orderedAt = new Date(Date.UTC(2026, 2, 10, 3, 0, 0));
      // A: order total 10,050 → diff 50 → matched
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: loA.id,
        externalOrderId: 'ORD-A-1',
        orderedAt,
        unitPrice: 10_050,
        quantity: 1,
      });
      // B: 10,500 → diff 500 → minor_diff
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: loB.id,
        externalOrderId: 'ORD-B-1',
        orderedAt,
        unitPrice: 10_500,
        quantity: 1,
      });
      // C: 12,000 → diff 2,000 → mismatch
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: loC.id,
        externalOrderId: 'ORD-C-1',
        orderedAt,
        unitPrice: 12_000,
        quantity: 1,
      });

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');

      expect(result.details).toHaveLength(3);
      const statuses = result.details.map((d) => d.status).sort();
      expect(statuses).toEqual(['matched', 'minor_diff', 'mismatch']);
      expect(result.summary.matchedCount).toBe(1);
      expect(result.summary.mismatchCount).toBe(2); // minor_diff + mismatch
      expect(result.summary.matchRate).toBe(33); // 1/3 → 33%
    });
  });

  describe('reconcile — KST month boundary', () => {
    it('#3 KST boundary: order at 2026-03-31 23:30 KST (14:30 UTC) is in March bucket', async () => {
      const { listing, listingOption } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'KST',
      });

      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          year: 2026,
          month: 3,
          revenue: 5_000,
          orderCount: 1,
        },
      });

      // KST 2026-03-31 23:30 = UTC 2026-03-31 14:30 — should belong to March (not April)
      const orderedAt = new Date(Date.UTC(2026, 2, 31, 14, 30, 0));
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: listingOption.id,
        externalOrderId: 'ORD-KST-1',
        orderedAt,
        unitPrice: 5_000,
        quantity: 1,
      });

      const march = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      expect(march.details[0].orderTotal).toBe(5_000);

      const april = await service.reconcile(TEST_COMPANY_ID, '2026-04');
      // april 에는 PL 없음 → details 빈 배열
      expect(april.details).toHaveLength(0);
    });

    it('#4 KST boundary: order at 2026-04-01 00:30 KST (2026-03-31 15:30 UTC) is in April bucket', async () => {
      const { listing, listingOption } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'KST2',
      });

      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          year: 2026,
          month: 4,
          revenue: 5_000,
          orderCount: 1,
        },
      });

      // KST 2026-04-01 00:30 = UTC 2026-03-31 15:30 — should belong to April
      const orderedAt = new Date(Date.UTC(2026, 2, 31, 15, 30, 0));
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: listingOption.id,
        externalOrderId: 'ORD-KST-2',
        orderedAt,
        unitPrice: 5_000,
        quantity: 1,
      });

      const april = await service.reconcile(TEST_COMPANY_ID, '2026-04');
      expect(april.details[0].orderTotal).toBe(5_000);

      const march = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      expect(march.details).toHaveLength(0);
    });
  });

  describe('reconcile — cancelled / returned orders excluded', () => {
    it('#5 cancelled + returned orders do not contribute to order aggregate', async () => {
      const { listing, listingOption } = await seedListing({
        companyId: TEST_COMPANY_ID,
        suffix: 'CANCEL',
      });

      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          year: 2026,
          month: 3,
          revenue: 10_000,
          orderCount: 1,
        },
      });

      const orderedAt = new Date(Date.UTC(2026, 2, 15, 3, 0, 0));
      // kept: paid
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: listingOption.id,
        externalOrderId: 'ORD-OK',
        orderedAt,
        unitPrice: 10_000,
        quantity: 1,
        status: 'paid',
      });
      // excluded: cancelled
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: listingOption.id,
        externalOrderId: 'ORD-CANCEL',
        orderedAt,
        unitPrice: 50_000,
        quantity: 1,
        status: 'cancelled',
      });
      // excluded: returned
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: listingOption.id,
        externalOrderId: 'ORD-RETURN',
        orderedAt,
        unitPrice: 30_000,
        quantity: 1,
        status: 'returned',
      });

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      expect(result.details[0].orderTotal).toBe(10_000);
      expect(result.details[0].orderCount).toBe(1);
    });
  });

  describe('reconcile — cross-tenant isolation', () => {
    it('#6 OTHER_COMPANY_ID orders do not appear in TEST_COMPANY_ID reconcile', async () => {
      const own = await seedListing({ companyId: TEST_COMPANY_ID, suffix: 'OWN' });
      const foreign = await seedListing({ companyId: OTHER_COMPANY_ID, suffix: 'FOR' });

      await prisma.profitLoss.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: own.listing.id,
          year: 2026,
          month: 3,
          revenue: 5_000,
          orderCount: 1,
        },
      });

      const orderedAt = new Date(Date.UTC(2026, 2, 15, 3, 0, 0));
      await seedOrderWithLine({
        companyId: TEST_COMPANY_ID,
        listingOptionId: own.listingOption.id,
        externalOrderId: 'OWN-1',
        orderedAt,
        unitPrice: 5_000,
        quantity: 1,
      });
      await seedOrderWithLine({
        companyId: OTHER_COMPANY_ID,
        listingOptionId: foreign.listingOption.id,
        externalOrderId: 'FOREIGN-1',
        orderedAt,
        unitPrice: 999_999,
        quantity: 1,
      });

      const result = await service.reconcile(TEST_COMPANY_ID, '2026-03');
      expect(result.details).toHaveLength(1);
      expect(result.details[0].listingId).toBe(own.listing.id);
      expect(result.details[0].orderTotal).toBe(5_000);
    });
  });

  describe('update — IDOR protection', () => {
    it('#7 cross-company update throws BadRequestException (IDOR defense)', async () => {
      // TEST_COMPANY_ID 소유 settlement
      const settlement = await prisma.settlement.create({
        data: {
          companyId: TEST_COMPANY_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      // OTHER_COMPANY_ID 가 TEST_COMPANY_ID 의 settlement 를 업데이트 시도 → IDOR
      await expect(
        service.update(settlement.id, OTHER_COMPANY_ID, { actualAmount: 99_999_999 }),
      ).rejects.toThrow(BadRequestException);

      // 원본 레코드는 변하지 않음
      const reread = await prisma.settlement.findUnique({ where: { id: settlement.id } });
      expect(reread?.actualAmount).toBe(0);
    });

    it('#8 same-company update succeeds', async () => {
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
