import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ChannelDashboardService } from '../channel-dashboard.service';
import { ChannelDashboardRepositoryAdapter } from '../../../adapter/out/repository/channel-dashboard.repository.adapter';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from '../../port/out/repository/channel-dashboard.repository.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../../test-helpers/real-prisma';

const PRIMARY_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const SECONDARY_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';

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
 *  - IDOR isolation: TEST_ORGANIZATION_ID result excludes OTHER_ORGANIZATION_ID rows.
 *
 * Fixture shape for primary organization (TEST_ORGANIZATION_ID):
 *  - 1 ChannelListing 'CL-A' (externalId EXT-A) + 1 ChannelListingOption.
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
        ChannelDashboardRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
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
    await seedDashboardAccounts();
  });

  async function seedDashboardAccounts() {
    await prisma.channelAccount.createMany({
      data: [
        {
          id: PRIMARY_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Primary Wing',
          externalAccountId: 'DASHBOARD-PRIMARY',
          isPrimary: true,
          status: 'active',
        },
        {
          id: OTHER_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Other Wing',
          externalAccountId: 'DASHBOARD-OTHER',
          isPrimary: true,
          status: 'active',
        },
      ],
    });
  }

  async function seedSecondaryAccountListing() {
    await prisma.channelAccount.create({
      data: {
        id: SECONDARY_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Secondary Wing',
        externalAccountId: 'DASHBOARD-SECONDARY',
        status: 'active',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: SECONDARY_ACCOUNT_ID,
        externalId: 'EXT-A',
        channelName: 'Listing A',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'VI-A-SECONDARY',
      },
    });

    return { listing, option };
  }

  // ---------------------------------------------------------------------------
  // Shared seed — primary organization (TEST_ORGANIZATION_ID) + cross-organization pollution
  // row under OTHER_ORGANIZATION_ID for IDOR verification.
  // ---------------------------------------------------------------------------
  async function seedFixture() {
    // ChannelListing + ChannelListingOption for TEST_ORGANIZATION_ID
    const listingA = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalId: 'EXT-A',
        channelName: 'Listing A',
      },
    });
    const loA = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listingA.id,
        externalOptionId: 'VI-A',
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
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalOrderId: 'ORD-1',
        orderedAt: new Date('2026-04-14T15:00:00.000Z'), // KST 2026-04-15 00:00
        status: 'paid',
        totalPrice: 999_999, // deliberate junk — I3 guard
        receiverName: 'A',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalOrderId: 'ORD-2',
        orderedAt: new Date('2026-04-15T15:00:00.000Z'), // KST 2026-04-16 00:00
        status: 'paid',
        totalPrice: 999_999,
        receiverName: 'B',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalOrderId: 'ORD-3',
        orderedAt: new Date('2026-04-16T15:00:00.000Z'), // KST 2026-04-17 00:00 — boundary
        status: 'paid',
        totalPrice: 100_000,
        receiverName: 'C',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        orderId: o1.id,
        channelAccountId: PRIMARY_ACCOUNT_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        orderId: o2.id,
        channelAccountId: PRIMARY_ACCOUNT_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        orderId: o2.id,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalReturnId: 'RET-3',
        status: 'return_request',
        type: 'RETURN',
        reason: '배송사고',
        faultBy: 'COURIER',
        requesterName: 'B',
        requestedAt: new Date('2026-04-15T16:30:00.000Z'),
      },
    });

    // Cross-tenant pollution row (OTHER_ORGANIZATION_ID) for IDOR verification.
    const otherListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalId: 'EXT-OTHER',
        channelName: 'Listing Other',
      },
    });
    const otherLo = await prisma.channelListingOption.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: otherListing.id,
        externalOptionId: 'VI-OTHER',
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalOrderId: 'ORD-OTHER',
        orderedAt: new Date('2026-04-14T15:30:00.000Z'),
        status: 'paid',
        totalPrice: 500_000,
        receiverName: 'X',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
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
        organizationId: OTHER_ORGANIZATION_ID,
        orderId: otherOrder.id,
        channelAccountId: OTHER_ACCOUNT_ID,
        externalReturnId: 'RET-OTHER',
        status: 'return_request',
        type: 'RETURN',
        reason: '단순변심',
        faultBy: 'CUSTOMER',
        requesterName: 'X',
        requestedAt: new Date('2026-04-14T17:00:00.000Z'),
      },
    });

    return { listingA, loA, orders: { o1, o2, o3 } };
  }

  // ---------------------------------------------------------------------------
  // #1 getSummary — pendingAccept uses status 'accept_wait',
  //                  pendingReturns uses OrderReturn.status 'return_request',
  //                  lastModifiedAt from ChannelListing.updatedAt.
  // ---------------------------------------------------------------------------
  describe('getSummary', () => {
    it('returns lastModifiedAt from latest ChannelListing.updatedAt (R-07 rename)', async () => {
      const { listingA } = await seedFixture();

      const result = await service.getSummary(TEST_ORGANIZATION_ID);

      expect(result.lastModifiedAt).toBeInstanceOf(Date);
      // Must equal the listing's updatedAt (only one ChannelListing for TEST_ORGANIZATION_ID)
      // Shared type is `string | Date | null` (zIsoDate union); runtime assertion above
      // guarantees Date here — cast to compare via getTime().
      expect((result.lastModifiedAt as Date).getTime()).toBe(listingA.updatedAt.getTime());
      // No lastSyncedAt leakage
      expect((result as unknown as Record<string, unknown>).lastSyncedAt).toBeUndefined();
    });

    it('pendingAccept counts orders with status=accept_wait; pendingReturns counts returns with status=return_request', async () => {
      await seedFixture();
      // Seed fixture has no accept_wait orders; 3 return_request returns
      const result = await service.getSummary(TEST_ORGANIZATION_ID);
      expect(result.pendingAccept).toBe(0);
      expect(result.pendingReturns).toBe(3); // RET-1 + RET-2 + RET-3 (COURIER still counts as a pending return)
    });

    it('returns null lastModifiedAt when no ChannelListing exists for the organization', async () => {
      const result = await service.getSummary(TEST_ORGANIZATION_ID);
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
      const result = await service.getRevenueTrend(TEST_ORGANIZATION_ID, from, to);

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

    it('IDOR: OTHER_ORGANIZATION_ID orders never leak into TEST_ORGANIZATION_ID result', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getRevenueTrend(TEST_ORGANIZATION_ID, from, to);

      const total = result.reduce((s, r) => s + r.revenue, 0);
      // Other organization has 500_000 — must NOT appear.
      expect(total).toBeLessThan(500_000);
      expect(total).toBe(49_000 + 100_000); // O1 + O2 + O3 line-item sums
    });

    it('returns empty array when no orders in range', async () => {
      await seedFixture();
      const from = new Date('2020-01-01T00:00:00.000Z');
      const to = new Date('2020-01-02T00:00:00.000Z');
      const result = await service.getRevenueTrend(TEST_ORGANIZATION_ID, from, to);
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // #3 getProductRanking — revenue desc + ChannelListing metadata + top 10.
  // ---------------------------------------------------------------------------
  describe('getProductRanking', () => {
    it('top row has sellerProductName from ChannelListing + revenue = SUM(lineItem.totalPrice)', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z'); // excludes O3
      const result = await service.getProductRanking(TEST_ORGANIZATION_ID, from, to);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sellerProductId: 'EXT-A',
        sellerProductName: 'Listing A',
        revenue: 49_000, // 25_000 (O1) + 24_000 (O2)
        orderCount: 2,
      });
    });

    it('IDOR: OTHER_ORGANIZATION_ID listings never surface for TEST_ORGANIZATION_ID', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getProductRanking(TEST_ORGANIZATION_ID, from, to);

      const names = result.map((r) => r.sellerProductName);
      expect(names).not.toContain('Listing Other');
      expect(names).toContain('Listing A');
    });

    it('keeps identical external product ids separate across channel accounts', async () => {
      await seedFixture();
      const { option } = await seedSecondaryAccountListing();
      const secondaryOrder = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: SECONDARY_ACCOUNT_ID,
          externalOrderId: 'ORD-SECONDARY',
          orderedAt: new Date('2026-04-15T16:00:00.000Z'),
          status: 'paid',
          totalPrice: 7_000,
          receiverName: 'Secondary buyer',
        },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: secondaryOrder.id,
          listingOptionId: option.id,
          quantity: 1,
          unitPrice: 7_000,
          totalPrice: 7_000,
          externalLineId: 'LI-SECONDARY',
        },
      });

      const result = await service.getProductRanking(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-14T15:00:00.000Z'),
        new Date('2026-04-16T15:00:00.000Z'),
      );

      expect(result).toHaveLength(2);
      expect(result.map((row) => row.revenue).sort((a, b) => b - a)).toEqual([49_000, 7_000]);
    });

    it('excludes a line item whose listing account differs from its order account', async () => {
      await seedFixture();
      const { option } = await seedSecondaryAccountListing();
      const mismatchedOrder = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: PRIMARY_ACCOUNT_ID,
          externalOrderId: 'ORD-MISMATCHED-ACCOUNT',
          orderedAt: new Date('2026-04-15T16:00:00.000Z'),
          status: 'paid',
          totalPrice: 900_000,
          receiverName: 'Mismatched buyer',
        },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: mismatchedOrder.id,
          listingOptionId: option.id,
          quantity: 1,
          unitPrice: 900_000,
          totalPrice: 900_000,
          externalLineId: 'LI-MISMATCHED-ACCOUNT',
        },
      });

      const result = await service.getProductRanking(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-14T15:00:00.000Z'),
        new Date('2026-04-16T15:00:00.000Z'),
      );

      expect(result).toEqual([
        {
          sellerProductId: 'EXT-A',
          sellerProductName: 'Listing A',
          revenue: 49_000,
          orderCount: 2,
        },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // #4 getReturnSummary — returnRate semantic: INNER JOIN order.orderedAt.
  //    returnRate = returnCount / orderCount (must be ≤ 1 per Zod contract).
  // ---------------------------------------------------------------------------
  describe('getReturnSummary', () => {
    it('returnCount counts returns whose ORDER was placed in window (INNER JOIN)', async () => {
      await seedFixture();

      // Narrow window: only O1 (orderedAt 2026-04-14T15:00Z) is in-range.
      // O2 (orderedAt 2026-04-15T15:00Z) is excluded by `lt to`.
      // RET-1 links to O1 (in-range) → counted.
      // RET-2, RET-3 link to O2 (out-of-range) → excluded by INNER JOIN.
      // No orphan returns in fixture → orphanReturnCount = 0.
      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-15T15:00:00.000Z'); // excludes O2
      const result = await service.getReturnSummary(TEST_ORGANIZATION_ID, from, to);

      expect(result).toEqual({
        orderCount: 1,   // O1 only
        returnCount: 1,  // RET-1 only (INNER JOIN: O2 out-of-range drops RET-2+RET-3)
        returnRate: 1,
        orphanReturnCount: 0,
      });
    });

    it('returnRate = 0 when orderCount = 0 (edge)', async () => {
      await seedFixture();
      const from = new Date('2030-01-01T00:00:00.000Z');
      const to = new Date('2030-01-02T00:00:00.000Z');
      const result = await service.getReturnSummary(TEST_ORGANIZATION_ID, from, to);
      expect(result.orderCount).toBe(0);
      expect(result.returnRate).toBe(0);
      expect(Number.isFinite(result.returnRate)).toBe(true);
      expect(result.orphanReturnCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // #4b R-2 returnRate semantic edge cases (inline helpers, isolated beforeEach).
  // ---------------------------------------------------------------------------

  /**
   * Inline seed helpers — NOT exported to test-helpers (scope guard).
   * Required Order fields from prisma/models/orders.prisma:
   *   organizationId, channelAccountId, externalOrderId
   *   (+ defaults: orderedAt, status, totalPrice, shippingPrice).
   */
  async function seedOrderInline(opts: {
    organizationId: string;
    orderedAt: string;
    externalOrderId: string;
  }): Promise<string> {
    const o = await prisma.order.create({
      data: {
        organizationId: opts.organizationId,
        channelAccountId: accountIdFor(opts.organizationId),
        externalOrderId: opts.externalOrderId,
        orderedAt: new Date(opts.orderedAt),
        status: 'accepted',
        totalPrice: 10000,
        shippingPrice: 3000,
      },
    });
    return o.id;
  }

  /**
   * Required OrderReturn fields from prisma/models/orders.prisma:
   *   organizationId, channelAccountId, externalReturnId, requestedAt
   *   (+ defaults: status, reason, faultBy, type).
   */
  async function seedReturnInline(opts: {
    organizationId: string;
    orderId: string | null;
    requestedAt: string;
    externalReturnId?: string;
  }): Promise<string> {
    const r = await prisma.orderReturn.create({
      data: {
        organizationId: opts.organizationId,
        orderId: opts.orderId,
        channelAccountId: accountIdFor(opts.organizationId),
        externalReturnId: opts.externalReturnId ?? `RET-INLINE-${Date.now()}-${Math.random()}`,
        requestedAt: new Date(opts.requestedAt),
        status: 'requested',
        reason: 'test',
        type: 'RETURN',
        faultBy: 'CUSTOMER',
      },
    });
    return r.id;
  }

  function accountIdFor(organizationId: string): string {
    return organizationId === TEST_ORGANIZATION_ID
      ? PRIMARY_ACCOUNT_ID
      : OTHER_ACCOUNT_ID;
  }

  describe('returnRate semantic edge cases', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBaseFixture(prisma);
      await seedDashboardAccounts();
    });

    it('past-period order with current-period return is EXCLUDED from current returnRate', async () => {
      // March order — outside April range
      const marchOrderId = await seedOrderInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderedAt: '2026-03-15T00:00:00Z',
        externalOrderId: 'OLD-1',
      });
      // April orders — inside range
      const aprOrder1Id = await seedOrderInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderedAt: '2026-04-05T00:00:00Z',
        externalOrderId: 'NEW-1',
      });
      await seedOrderInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderedAt: '2026-04-10T00:00:00Z',
        externalOrderId: 'NEW-2',
      });
      // NEW-3 at 2026-04-20 is IN range (Apr 20 < May 1 upper bound)
      await seedOrderInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderedAt: '2026-04-20T00:00:00Z',
        externalOrderId: 'NEW-3',
      });
      // Return on march order with april requestedAt — orderId linked to march order (out-of-range)
      await seedReturnInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderId: marchOrderId,
        requestedAt: '2026-04-07T00:00:00Z',
        externalReturnId: 'PAST-RET-1',
      });
      // Return on april order with future requestedAt — orderId linked to apr order (in-range)
      await seedReturnInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderId: aprOrder1Id,
        requestedAt: '2026-04-22T00:00:00Z',
        externalReturnId: 'PAST-RET-2',
      });

      const result = await service.getReturnSummary(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-01'),
        new Date('2026-05-01'),
      );
      // orderCount: NEW-1 + NEW-2 + NEW-3 = 3 (all April orders)
      expect(result.orderCount).toBe(3);
      // returnCount: only NEW-1's return qualifies (INNER JOIN: march order excluded)
      expect(result.returnCount).toBe(1);
      expect(result.returnRate).toBeCloseTo(1 / 3, 6);
      expect(result.orphanReturnCount).toBe(0);
    });

    it('orphan return (orderId NULL) goes to orphanReturnCount only', async () => {
      await seedOrderInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderedAt: '2026-04-05T00:00:00Z',
        externalOrderId: 'APR-1',
      });
      await seedReturnInline({
        organizationId: TEST_ORGANIZATION_ID,
        orderId: null,
        requestedAt: '2026-04-10T00:00:00Z',
        externalReturnId: 'ORPHAN-1',
      });

      const result = await service.getReturnSummary(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-01'),
        new Date('2026-05-01'),
      );
      expect(result).toEqual({
        orderCount: 1,
        returnCount: 0,
        returnRate: 0,
        orphanReturnCount: 1,
      });
    });

    it('IDOR — returns from OTHER_COMPANY do not leak into TEST_COMPANY', async () => {
      const otherOrderId = await seedOrderInline({
        organizationId: OTHER_ORGANIZATION_ID,
        orderedAt: '2026-04-15T00:00:00Z',
        externalOrderId: 'OTHER-1',
      });
      await seedReturnInline({
        organizationId: OTHER_ORGANIZATION_ID,
        orderId: otherOrderId,
        requestedAt: '2026-04-20T00:00:00Z',
        externalReturnId: 'OTHER-RET-1',
      });

      const result = await service.getReturnSummary(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-01'),
        new Date('2026-05-01'),
      );
      expect(result).toEqual({
        orderCount: 0,
        returnCount: 0,
        returnRate: 0,
        orphanReturnCount: 0,
      });

      // Double-blind: verify OTHER_COMPANY actually returns the data (service isn't universally broken)
      const otherResult = await service.getReturnSummary(OTHER_ORGANIZATION_ID, new Date('2026-04-01'), new Date('2026-05-01'));
      expect(otherResult).toEqual({
        orderCount: 1,
        returnCount: 1,
        returnRate: 1,
        orphanReturnCount: 0,
      });
    });

    it('perf baseline: 1000 orders + 200 returns completes under 2s', async () => {
      // Bulk-seed 1000 orders via createMany for speed
      const orderData = Array.from({ length: 1000 }, (_, i) => ({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalOrderId: `PERF-${i}`,
        orderedAt: new Date(
          `2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        ),
        status: 'accepted',
        totalPrice: 10000,
        shippingPrice: 3000,
      }));
      await prisma.order.createMany({ data: orderData });

      // Fetch IDs (needed for FK in returns)
      const orders = await prisma.order.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: { startsWith: 'PERF-' },
        },
        select: { id: true },
        orderBy: { orderedAt: 'asc' },
      });
      const orderIds = orders.map((o) => o.id);

      // 150 linked returns + 50 orphan returns via createMany
      const linkedReturnData = Array.from({ length: 150 }, (_, i) => ({
        organizationId: TEST_ORGANIZATION_ID,
        orderId: orderIds[i],
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalReturnId: `PERF-RET-LINKED-${i}`,
        requestedAt: new Date('2026-04-15T00:00:00Z'),
        status: 'requested',
        reason: 'test',
        type: 'RETURN',
        faultBy: 'CUSTOMER',
      }));
      const orphanReturnData = Array.from({ length: 50 }, (_, i) => ({
        organizationId: TEST_ORGANIZATION_ID,
        orderId: null,
        channelAccountId: PRIMARY_ACCOUNT_ID,
        externalReturnId: `PERF-RET-ORPHAN-${i}`,
        requestedAt: new Date('2026-04-15T00:00:00Z'),
        status: 'requested',
        reason: 'test',
        type: 'RETURN',
        faultBy: 'CUSTOMER',
      }));
      await prisma.orderReturn.createMany({ data: linkedReturnData });
      await prisma.orderReturn.createMany({ data: orphanReturnData });

      const start = Date.now();
      const result = await service.getReturnSummary(
        TEST_ORGANIZATION_ID,
        new Date('2026-04-01'),
        new Date('2026-05-01'),
      );
      const latencyMs = Date.now() - start;

      expect(result.orderCount).toBe(1000);
      expect(result.returnCount).toBe(150);
      expect(result.orphanReturnCount).toBe(50);
      expect(latencyMs).toBeLessThan(2000);
      console.log(`[perf] getReturnSummary 1000 orders + 200 returns → ${latencyMs}ms`);
    });
  });

  // ---------------------------------------------------------------------------
  // #5 getReturnReasonBreakdown — flat `_count: true` shape (R-12).
  // ---------------------------------------------------------------------------
  describe('getReturnReasonBreakdown', () => {
    it('groups returns by reason; scoped to organizationId; flat _count number', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getReturnReasonBreakdown(TEST_ORGANIZATION_ID, from, to);

      // TEST_ORGANIZATION_ID: 단순변심 × 1, 제품불량 × 1, 배송사고 × 1
      const byReason = new Map(result.map((r) => [r.reason, r.count]));
      expect(byReason.get('단순변심')).toBe(1);
      expect(byReason.get('제품불량')).toBe(1);
      expect(byReason.get('배송사고')).toBe(1);
      // count must be a plain number (R-12 flat shape)
      for (const row of result) {
        expect(typeof row.count).toBe('number');
      }
    });

    it('IDOR: OTHER_ORGANIZATION_ID reasons never leak', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getReturnReasonBreakdown(TEST_ORGANIZATION_ID, from, to);

      // TEST_ORGANIZATION_ID has a 단순변심 (RET-1). OTHER also has a 단순변심 (RET-OTHER).
      // Result for TEST_ORGANIZATION_ID should show '단순변심': 1 (not 2).
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
      const result = await service.getReturnFaultSplit(TEST_ORGANIZATION_ID, from, to);

      // TEST_ORGANIZATION_ID has 1 CUSTOMER (RET-1), 1 VENDOR (RET-2), 1 COURIER (RET-3, dropped)
      expect(result).toEqual({ customer: 1, vendor: 1 });
    });

    it('IDOR: OTHER_ORGANIZATION_ID returns never leak', async () => {
      await seedFixture();

      const from = new Date('2026-04-14T00:00:00.000Z');
      const to = new Date('2026-04-20T00:00:00.000Z');
      const result = await service.getReturnFaultSplit(TEST_ORGANIZATION_ID, from, to);

      // OTHER has 1 CUSTOMER — must NOT inflate TEST_ORGANIZATION_ID's customer count.
      expect(result.customer).toBe(1); // only RET-1, NOT +RET-OTHER
    });
  });

  // ---------------------------------------------------------------------------
  // #7 2-hop defense-in-depth (R1/R2) — composite FKs reject cross-organization
  //    Order/ChannelSku links, while raw-SQL aggregations still bind organizationId
  //    on every joined tenant-owned table.
  // ---------------------------------------------------------------------------
  describe('2-hop defense-in-depth (R1/R2)', () => {
    it('getProductRanking: schema rejects a cross-tenant ChannelSku link', async () => {
      const { orders } = await seedFixture();
      const otherListingOption = await prisma.channelListingOption.findFirstOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID, externalOptionId: 'VI-OTHER' },
      });

      await expect(prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: orders.o1.id,
          listingOptionId: otherListingOption.id,
          quantity: 1,
          unitPrice: 1_000_000,
          totalPrice: 1_000_000,
          externalLineId: 'CROSS-LI-1',
        },
      })).rejects.toMatchObject({ code: 'P2003' });

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getProductRanking(TEST_ORGANIZATION_ID, from, to);

      const ids = result.map((r) => r.sellerProductId);
      const names = result.map((r) => r.sellerProductName);
      expect(ids).not.toContain('EXT-OTHER');
      expect(names).not.toContain('Listing Other');
      expect(names).toContain('Listing A');
    });

    it('getRevenueTrend: schema rejects cross-organization OrderLineItem.organizationId corruption', async () => {
      const { orders } = await seedFixture();

      // Corrupt: an OrderLineItem row whose organizationId belongs to
      // OTHER_ORGANIZATION_ID, but is attached to a TEST_ORGANIZATION order.
      // The composite FK now rejects this before raw dashboard filters run.
      const otherListingOption = await prisma.channelListingOption.findFirstOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID, externalOptionId: 'VI-OTHER' },
      });
      await expect(
        prisma.orderLineItem.create({
          data: {
            organizationId: OTHER_ORGANIZATION_ID,
            orderId: orders.o1.id,
            listingOptionId: otherListingOption.id,
            quantity: 1,
            unitPrice: 750_000,
            totalPrice: 750_000,
            externalLineId: 'CROSS-LI-2',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getRevenueTrend(TEST_ORGANIZATION_ID, from, to);

      // O1 day (2026-04-15) sums to 25_000 (20_000 + 5_000).
      // The rejected 750_000 corruption row cannot inflate the result.
      const total = result.reduce((s, r) => s + r.revenue, 0);
      expect(total).toBe(49_000); // 25_000 (O1) + 24_000 (O2). Never +750_000.
      const day15 = result.find((r) => r.day === '2026-04-15');
      expect(day15?.revenue).toBe(25_000);
    });

    it('getProductRanking: unresolved provider lines do not fabricate ChannelProduct identity', async () => {
      await seedFixture();
      const unresolvedOrder = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: PRIMARY_ACCOUNT_ID,
          externalOrderId: 'UNRESOLVED-PROVIDER-1',
          orderedAt: new Date('2026-04-14T15:00:00.000Z'),
          status: 'paid',
          totalPrice: 333_000,
          receiverName: 'Unresolved',
        },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: unresolvedOrder.id,
          listingOptionId: null,
          productName: 'Unresolved provider product',
          quantity: 1,
          unitPrice: 333_000,
          totalPrice: 333_000,
          externalLineId: 'UNRESOLVED-LI-1',
        },
      });

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-16T15:00:00.000Z');
      const result = await service.getProductRanking(TEST_ORGANIZATION_ID, from, to);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sellerProductId: 'EXT-A',
        sellerProductName: 'Listing A',
        revenue: 49_000,
      });
    });
  });
});
