import { realRegistrationStates } from '../../../../../test-helpers/registration-state';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ChannelDashboardService } from '../channel-dashboard.service';
import { ChannelDashboardRepositoryAdapter } from '../../../../adapter/out/repository/channel-dashboard.repository.adapter';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from '../../../port/out/repository/channel-dashboard.repository.port';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { kstBusinessDate } from '../../../../../common/kst';
import { CHANNEL_ACCOUNT_PORT } from '../../../port/in/account/channel-account.port';
import { ChannelAccountService } from '../../account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../../../adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../../../adapter/out/credentials/channel-credentials.adapter';
import { ChannelListingQueryPersistenceAdapter } from '../../../../adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelListingQueryService } from '../channel-listing-query.service';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import type { PrismaClient } from '@prisma/client';
import { ChannelsProductMappingGenerationAdapter } from "../../../../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

const PRIMARY_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const SECONDARY_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';
const ORDER_COLLECTION_ACCOUNT_ID = '10000000-0000-4000-8000-000000000003';
const OTHER_ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';
const ORDER_FACT_RUN_ID = '10000000-0000-4000-8000-000000000004';
const OTHER_ORDER_FACT_RUN_ID = '20000000-0000-4000-8000-000000000002';

/**
 * Plan B2c.dashboard T15 — channel-dashboard.pg integration spec.
 *
 * Verifies:
 *  - I3 canonical: revenue == SUM(lineItem.totalPrice), NOT SUM(order.totalPrice).
 *  - I8 half-open: `lt to` excludes upper boundary.
 *  - R-07 rename: `lastModifiedAt` populated from ChannelListing.updatedAt.
 *  - KST day bucket: orderedAt 2026-04-14T15:00Z (KST 2026-04-15 00:00) buckets as 2026-04-15.
 *  - IDOR isolation: TEST_ORGANIZATION_ID result excludes OTHER_ORGANIZATION_ID rows.
 *
 * Fixture shape for primary organization (TEST_ORGANIZATION_ID):
 *  - 1 ChannelListing 'CL-A' (externalId EXT-A) + 1 ChannelListingOption.
 *  - 3 Orders @ KST day boundaries + line items (I3 canonical revenue != order.totalPrice).
 */

describe('Channel dashboard (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ChannelDashboardService;
  let channelListingQueries: ChannelListingQueryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    channelListingQueries = new ChannelListingQueryService(
      new ChannelListingQueryPersistenceAdapter(prisma as unknown as PrismaService),
      { findForListings: async () => [] } as never, realRegistrationStates(prisma as unknown as PrismaService),);

    const m = await Test.createTestingModule({
      providers: [
        ChannelDashboardRepositoryAdapter,
        {
          provide: ChannelDashboardService,
          useFactory: (repository: InstanceType<typeof ChannelDashboardRepositoryAdapter>) =>
            new ChannelDashboardService(repository),
          inject: [CHANNEL_DASHBOARD_REPOSITORY_PORT],
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: CHANNEL_ACCOUNT_PORT,
          useValue: new ChannelAccountService(
            new ChannelAccountPersistenceAdapter(prisma as unknown as PrismaService, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
            new ChannelCredentialsAdapter(),
          ),
        },
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
          id: ORDER_COLLECTION_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'haebub-mall',
          name: 'Dashboard order source',
          externalAccountId: 'haebub-mall',
          status: 'active',
        },
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
    await prisma.sourceImportRun.createMany({
      data: [
        {
          id: ORDER_FACT_RUN_ID,
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'test_order_facts',
          status: 'completed',
        },
        {
          id: OTHER_ORDER_FACT_RUN_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          sourceType: 'test_order_facts',
          status: 'completed',
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
        sourceImportRunId: ORDER_FACT_RUN_ID,
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
        sourceImportRunId: ORDER_FACT_RUN_ID,
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
        sourceImportRunId: ORDER_FACT_RUN_ID,
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
        sourceImportRunId: OTHER_ORDER_FACT_RUN_ID,
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

    return { listingA, loA, orders: { o1, o2, o3 } };
  }

  // ---------------------------------------------------------------------------
  // #1 getSummary — pendingAccept uses status 'accept_wait',
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

    it('pendingAccept counts orders with status=accept_wait', async () => {
      await seedFixture();
      // Seed fixture has no accept_wait orders
      const result = await service.getSummary(TEST_ORGANIZATION_ID);
      expect(result.pendingAccept).toBe(0);
    });

    it('returns null order metrics when today has not been observed', async () => {
      const result = await service.getSummary(TEST_ORGANIZATION_ID);
      expect(result.lastModifiedAt).toBeNull();
      expect(result.todayOrders).toEqual({ count: null, revenue: null });
    });

    it('returns measured zero after a completed run confirms empty coverage today', async () => {
      const today = kstBusinessDate(new Date());
      await prisma.sourceImportRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ORDER_COLLECTION_ACCOUNT_ID,
          sourceType: 'order_collection_mall',
          status: 'completed',
          importedAt: new Date(),
          coverageStartDate: today,
          coverageEndDate: today,
        },
      });

      const result = await service.getSummary(TEST_ORGANIZATION_ID);

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
          sourceImportRunId: ORDER_FACT_RUN_ID,
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
          sourceImportRunId: ORDER_FACT_RUN_ID,
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
  // #4 2-hop defense-in-depth (R1/R2) — owner capabilities fence logical
  //    cross-owner ids by organization, while same-owner relations and SQL reads
  //    keep their organization scope.
  // ---------------------------------------------------------------------------
  describe('2-hop defense-in-depth (R1/R2)', () => {
    it('does not expose a cross-tenant ChannelSku link through Channels owner reads or ranking', async () => {
      const { orders } = await seedFixture();
      const otherListingOption = await prisma.channelListingOption.findFirstOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID, externalOptionId: 'VI-OTHER' },
      });

      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: orders.o1.id,
          listingOptionId: otherListingOption.id,
          quantity: 1,
          unitPrice: 1_000_000,
          totalPrice: 1_000_000,
          externalLineId: 'CROSS-LI-1',
        },
      });

      const ownerIdentities = await prisma.$transaction((tx) =>
        channelListingQueries.readOptionIdentities(ownerTransaction(tx), {
          organizationId: TEST_ORGANIZATION_ID,
          optionIds: [otherListingOption.id],
          activeOnly: true,
        }),
      );
      expect(ownerIdentities).toEqual([]);

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
          sourceImportRunId: ORDER_FACT_RUN_ID,
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
