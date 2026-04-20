import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelDashboardService } from '../channel-dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../../test-helpers/real-prisma';

/**
 * Plan B2c.dashboard T15 — channel-dashboard.pg integration spec.
 *
 * Verifies:
 *  - I3 canonical: revenue == SUM(lineItem.totalPrice), NOT SUM(order.totalPrice).
 *  - I8 half-open: `lt to` excludes upper boundary.
 *  - R-07 rename: `lastModifiedAt` populated from ChannelListing.updatedAt.
 *  - R-12 flat _count: Prisma groupBy returns `_count: number`.
 *  - C-11 unknown faultBy drop: only CUSTOMER/VENDOR surfaces.
 *  - KST day bucket: orderedAt 2026-04-14T15:00Z (KST 2026-04-15 00:00) buckets as 2026-04-15.
 *  - IDOR isolation: TEST_COMPANY_ID result excludes OTHER_COMPANY_ID rows.
 *
 * Fixture shape for primary company (TEST_COMPANY_ID):
 *  - 1 MasterProduct 'MP-A' (code M-01) + 1 ChannelListing 'CL-A' (externalId EXT-A).
 *  - 1 ChannelListingOption.
 *  - 3 Orders @ KST day boundaries + line items (I3 canonical revenue != order.totalPrice).
 *  - 2 OrderReturns (1 CUSTOMER '단순변심' + 1 VENDOR '제품불량') + 1 COURIER fault (C-11 drop).
 */

describe('Channel dashboard (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelDashboardService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        ChannelDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ChannelDashboardService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // ---------------------------------------------------------------------------
  // Shared seed — primary company (TEST_COMPANY_ID) + cross-company pollution
  // row under OTHER_COMPANY_ID for IDOR verification.
  // ---------------------------------------------------------------------------
  async function seedFixture() {
    // MasterProduct + ChannelListing + ChannelListingOption for TEST_COMPANY_ID
    const masterA = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-01',
        name: 'Master A',
        category: 'Toy',
        optionCounter: 1,
      },
    });
    const listingA = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterA.id,
        channel: 'coupang',
        externalId: 'EXT-A',
        channelName: 'Listing A',
      },
    });
    const optA = await prisma.productOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterA.id,
        optionName: 'OPT-A',
        sku: 'M-01-001',
      },
    });
    const loA = await prisma.channelListingOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingA.id,
        optionId: optA.id,
        vendorItemId: 'VI-A',
      },
    });

    // Orders @ KST day boundary (2026-04-14T15:00Z == KST 2026-04-15 00:00)
    //   O1: KST 2026-04-15 (orderedAt 14T15:00Z) — 2 line items
    //   O2: KST 2026-04-16 (orderedAt 15T15:00Z) — 1 line item
    //   O3: KST 2026-04-17 excluded by half-open `to` (orderedAt 16T15:00Z is boundary)
    //
    // Notice: Order.totalPrice is deliberately WRONG vs SUM(lineItem.totalPrice).
    // If the service uses order.totalPrice, revenue will be wrong — I3 canonical guard.
    const o1 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-1',
        orderedAt: new Date('2026-04-14T15:00:00.000Z'), // KST 2026-04-15 00:00
        status: 'paid',
        totalPrice: 999_999, // deliberate junk — I3 guard
        receiverName: 'A',
        listingId: listingA.id,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o1.id,
        listingOptionId: loA.id,
        quantity: 2,
        unitPrice: 10_000,
        totalPrice: 20_000,
        externalLineId: 'LI-1A',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o1.id,
        listingOptionId: loA.id,
        quantity: 1,
        unitPrice: 5_000,
        totalPrice: 5_000,
        externalLineId: 'LI-1B',
      },
    });

    const o2 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-2',
        orderedAt: new Date('2026-04-15T15:00:00.000Z'), // KST 2026-04-16 00:00
        status: 'paid',
        totalPrice: 999_999,
        receiverName: 'B',
        listingId: listingA.id,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o2.id,
        listingOptionId: loA.id,
        quantity: 3,
        unitPrice: 8_000,
        totalPrice: 24_000,
        externalLineId: 'LI-2A',
      },
    });

    // O3 lives at the boundary: orderedAt >= to → excluded by half-open.
    const o3 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-3',
        orderedAt: new Date('2026-04-16T15:00:00.000Z'), // KST 2026-04-17 00:00 — boundary
        status: 'paid',
        totalPrice: 100_000,
        receiverName: 'C',
        listingId: listingA.id,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o3.id,
        listingOptionId: loA.id,
        quantity: 1,
        unitPrice: 100_000,
        totalPrice: 100_000,
        externalLineId: 'LI-3A',
      },
    });

    // OrderReturns — 2 in-window + 1 COURIER (C-11 drop)
    await prisma.orderReturn.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o1.id,
        platform: 'coupang',
        externalReturnId: 'RET-1',
        status: 'return_request',
        type: 'RETURN',
        reason: '단순변심',
        faultBy: 'CUSTOMER',
        requesterName: 'A',
        requestedAt: new Date('2026-04-14T16:00:00.000Z'),
      },
    });
    await prisma.orderReturn.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o2.id,
        platform: 'coupang',
        externalReturnId: 'RET-2',
        status: 'return_request',
        type: 'RETURN',
        reason: '제품불량',
        faultBy: 'VENDOR',
        requesterName: 'B',
        requestedAt: new Date('2026-04-15T16:00:00.000Z'),
      },
    });
    // C-11: COURIER row persisted — service must drop (returns 0 in split).
    await prisma.orderReturn.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o2.id,
        platform: 'coupang',
        externalReturnId: 'RET-3',
        status: 'return_request',
        type: 'RETURN',
        reason: '배송사고',
        faultBy: 'COURIER',
        requesterName: 'B',
        requestedAt: new Date('2026-04-15T16:30:00.000Z'),
      },
    });

    // Cross-tenant pollution row (OTHER_COMPANY_ID) for IDOR verification.
    const otherMaster = await prisma.masterProduct.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        code: 'M-OTHER',
        name: 'Other Master',
        category: 'Toy',
        optionCounter: 1,
      },
    });
    const otherListing = await prisma.channelListing.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: otherMaster.id,
        channel: 'coupang',
        externalId: 'EXT-OTHER',
        channelName: 'Listing Other',
      },
    });
    const otherOpt = await prisma.productOption.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: otherMaster.id,
        optionName: 'OPT-OTHER',
        sku: 'M-OTHER-001',
      },
    });
    const otherLo = await prisma.channelListingOption.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: otherListing.id,
        optionId: otherOpt.id,
        vendorItemId: 'VI-OTHER',
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-OTHER',
        orderedAt: new Date('2026-04-14T15:30:00.000Z'),
        status: 'paid',
        totalPrice: 500_000,
        receiverName: 'X',
        listingId: otherListing.id,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        orderId: otherOrder.id,
        listingOptionId: otherLo.id,
        quantity: 10,
        unitPrice: 50_000,
        totalPrice: 500_000,
        externalLineId: 'LI-OTHER',
      },
    });
    await prisma.orderReturn.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        orderId: otherOrder.id,
        platform: 'coupang',
        externalReturnId: 'RET-OTHER',
        status: 'return_request',
        type: 'RETURN',
        reason: '단순변심',
        faultBy: 'CUSTOMER',
        requesterName: 'X',
        requestedAt: new Date('2026-04-14T17:00:00.000Z'),
      },
    });

    return { masterA, listingA, loA, orders: { o1, o2, o3 } };
  }

  // ---------------------------------------------------------------------------
  // #1 getSummary — pendingAccept uses status 'accept_wait',
  //                  pendingReturns uses OrderReturn.status 'return_request',
  //                  lastModifiedAt from ChannelListing.updatedAt.
  // ---------------------------------------------------------------------------
  describe('getSummary', () => {
    it('returns lastModifiedAt from latest ChannelListing.updatedAt (R-07 rename)', async () => {
      const { listingA } = await seedFixture();

      const result = await service.getSummary(TEST_COMPANY_ID);

      expect(result.lastModifiedAt).toBeInstanceOf(Date);
      // Must equal the listing's updatedAt (only one ChannelListing for TEST_COMPANY_ID)
      expect(result.lastModifiedAt?.getTime()).toBe(listingA.updatedAt.getTime());
      // No lastSyncedAt leakage
      expect((result as unknown as Record<string, unknown>).lastSyncedAt).toBeUndefined();
    });

    it('pendingAccept counts orders with status=accept_wait; pendingReturns counts returns with status=return_request', async () => {
      await seedFixture();
      // Seed fixture has no accept_wait orders; 3 return_request returns
      const result = await service.getSummary(TEST_COMPANY_ID);
      expect(result.pendingAccept).toBe(0);
      expect(result.pendingReturns).toBe(3); // RET-1 + RET-2 + RET-3 (COURIER still counts as a pending return)
    });

    it('returns null lastModifiedAt when no ChannelListing exists for the company', async () => {
      const result = await service.getSummary(TEST_COMPANY_ID);
      expect(result.lastModifiedAt).toBeNull();
      expect(result.todayOrders).toEqual({ count: 0, revenue: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // #2 getRevenueTrend — I3 canonical SUM(lineItem.totalPrice) + KST bucket
  //                      + half-open `lt to` exclusion.
  // ---------------------------------------------------------------------------
  describe('getRevenueTrend', () => {
    it('revenue = SUM(lineItem.totalPrice) bucketed by KST day; half-open excludes `to`', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z'); // KST 2026-04-15 00:00
      const to = new Date('2026-04-16T15:00:00.000Z'); // KST 2026-04-17 00:00 (excluded)
      const result = await service.getRevenueTrend(TEST_COMPANY_ID, from, to);

      // Expected:
      //   2026-04-15 bucket: O1 (20_000 + 5_000 = 25_000 line-item sum, NOT order.totalPrice 999_999)
      //   2026-04-16 bucket: O2 (24_000)
      //   O3 on 2026-04-17 excluded by half-open
      expect(result).toHaveLength(2);
      const byDay = new Map(result.map((r) => [r.day, r]));
      expect(byDay.get('2026-04-15')).toEqual({
        day: '2026-04-15',
        revenue: 25_000,
        orderCount: 1,
      });
      expect(byDay.get('2026-04-16')).toEqual({
        day: '2026-04-16',
        revenue: 24_000,
        orderCount: 1,
      });
      // Verify `.reduce` sanity: total 49_000 (never 999_999)
      expect(result.reduce((s, r) => s + r.revenue, 0)).toBe(49_000);
    });

    it('IDOR: OTHER_COMPANY_ID orders never leak into TEST_COMPANY_ID result', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getRevenueTrend(TEST_COMPANY_ID, from, to);

      const total = result.reduce((s, r) => s + r.revenue, 0);
      // Other company has 500_000 — must NOT appear.
      expect(total).toBeLessThan(500_000);
      expect(total).toBe(49_000 + 100_000); // O1 + O2 + O3 line-item sums
    });

    it('returns empty array when no orders in range', async () => {
      await seedFixture();
      const from = new Date('2020-01-01T00:00:00.000Z');
      const to = new Date('2020-01-02T00:00:00.000Z');
      const result = await service.getRevenueTrend(TEST_COMPANY_ID, from, to);
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // #3 getProductRanking — revenue desc + master.name JOIN + top 10.
  // ---------------------------------------------------------------------------
  describe('getProductRanking', () => {
    it('top row has sellerProductName from master.name (JOIN check) + revenue = SUM(lineItem.totalPrice)', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z'); // excludes O3
      const result = await service.getProductRanking(TEST_COMPANY_ID, from, to);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sellerProductId: 'EXT-A',
        sellerProductName: 'Master A',
        revenue: 49_000, // 25_000 (O1) + 24_000 (O2)
        orderCount: 2,
      });
    });

    it('IDOR: OTHER_COMPANY_ID listings never surface for TEST_COMPANY_ID', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getProductRanking(TEST_COMPANY_ID, from, to);

      const names = result.map((r) => r.sellerProductName);
      expect(names).not.toContain('Other Master');
      expect(names).toContain('Master A');
    });
  });

  // ---------------------------------------------------------------------------
  // #4 getReturnSummary — orderCount 0 edge → returnRate 0.
  // ---------------------------------------------------------------------------
  describe('getReturnSummary', () => {
    it('orderCount + returnCount both scoped to companyId + half-open window', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getReturnSummary(TEST_COMPANY_ID, from, to);

      // In-window orders: O1 + O2 = 2 (O3 excluded by half-open)
      // In-window returns: RET-1 + RET-2 + RET-3 = 3 (faultBy=COURIER still counted here — C-11 only applies to faultSplit)
      expect(result.orderCount).toBe(2);
      expect(result.returnCount).toBe(3);
      expect(result.returnRate).toBeCloseTo(1.5, 6);
    });

    it('returnRate = 0 when orderCount = 0 (edge)', async () => {
      await seedFixture();
      const from = new Date('2030-01-01T00:00:00.000Z');
      const to = new Date('2030-01-02T00:00:00.000Z');
      const result = await service.getReturnSummary(TEST_COMPANY_ID, from, to);
      expect(result.orderCount).toBe(0);
      expect(result.returnRate).toBe(0);
      expect(Number.isFinite(result.returnRate)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // #5 getReturnReasonBreakdown — flat `_count: true` shape (R-12).
  // ---------------------------------------------------------------------------
  describe('getReturnReasonBreakdown', () => {
    it('groups returns by reason; scoped to companyId; flat _count number', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getReturnReasonBreakdown(TEST_COMPANY_ID, from, to);

      // TEST_COMPANY_ID: 단순변심 × 1, 제품불량 × 1, 배송사고 × 1
      const byReason = new Map(result.map((r) => [r.reason, r.count]));
      expect(byReason.get('단순변심')).toBe(1);
      expect(byReason.get('제품불량')).toBe(1);
      expect(byReason.get('배송사고')).toBe(1);
      // count must be a plain number (R-12 flat shape)
      for (const row of result) {
        expect(typeof row.count).toBe('number');
      }
    });

    it('IDOR: OTHER_COMPANY_ID reasons never leak', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getReturnReasonBreakdown(TEST_COMPANY_ID, from, to);

      // TEST_COMPANY_ID has a 단순변심 (RET-1). OTHER also has a 단순변심 (RET-OTHER).
      // Result for TEST_COMPANY_ID should show '단순변심': 1 (not 2).
      const customerCount = result.find((r) => r.reason === '단순변심')?.count ?? 0;
      expect(customerCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // #6 getReturnFaultSplit — CUSTOMER/VENDOR only (C-11 drop).
  // ---------------------------------------------------------------------------
  describe('getReturnFaultSplit', () => {
    it('drops unknown faultBy (COURIER); returns customer + vendor only', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getReturnFaultSplit(TEST_COMPANY_ID, from, to);

      // TEST_COMPANY_ID has 1 CUSTOMER (RET-1), 1 VENDOR (RET-2), 1 COURIER (RET-3, dropped)
      expect(result).toEqual({ customer: 1, vendor: 1 });
    });

    it('IDOR: OTHER_COMPANY_ID returns never leak', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getReturnFaultSplit(TEST_COMPANY_ID, from, to);

      // OTHER has 1 CUSTOMER — must NOT inflate TEST_COMPANY_ID's customer count.
      expect(result.customer).toBe(1); // only RET-1, NOT +RET-OTHER
    });
  });
});
