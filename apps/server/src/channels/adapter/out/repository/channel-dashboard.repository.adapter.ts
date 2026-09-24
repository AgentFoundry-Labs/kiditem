import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays, kstDayStart } from '../../../../common/kst';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../application/port/in/account/channel-account.port';
import {
  readDailyOrderFacts,
  readListingOptionOrderFacts,
  readOrderStatusCount,
  readOrderWindowFacts,
} from '../../../../orders/adapter/out/persistence/read/order-facts.reader';
import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
} from '@kiditem/shared/channel-dashboard';
import type { ChannelDashboardRepositoryPort } from '../../../application/port/out/repository/channel-dashboard.repository.port';

/**
 * Channel dashboard response shapes — typed via `@kiditem/shared` Zod schemas
 * with `satisfies` drift guard (no local interfaces).
 *
 * Service invariants (must be preserved by future edits):
 * - revenue = SUM(oli.total_price), never SUM(o.total_price).
 * - organizationId is threaded from `@CurrentOrganization()` and required on every read.
 *   Raw-SQL aggregations bind `${organizationId}::uuid` as a 2-hop tenant predicate
 *   on every joined tenant-owned table (`orders`, `order_line_items`,
 *   `channel_listing_options`, `channel_listings`) — never rely on a single
 *   `o.organization_id` filter to gate downstream JOINs (defense-in-depth against
 *   stray FK invariants between tenants). See channels/CLAUDE.md R1/R2/R3
 *   risk rule.
 * - Time windows are half-open: `gte` / `lt` only, never `lte`.
 * - `ChannelListing.updatedAt` ("lastModifiedAt") is bumped on any edit, not
 *   only sync ops — do not present it as "last synced at".
 *
 * Canonical order SQL lives in the Orders reader. This adapter owns each
 * transaction and resolves Channels display metadata inside that transaction.
 */

@Injectable()
export class ChannelDashboardRepositoryAdapter implements ChannelDashboardRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT)
    private readonly channelAccounts: ChannelAccountPort,
  ) {}

  async getSummary(organizationId: string): Promise<ChannelDashboardSummary> {
    const todayStart = kstDayStart(new Date());
    const tomorrowStart = addDays(todayStart, 1);
    return this.prisma.$transaction(async (tx) => {
      const todayOrders = await readOrderWindowFacts(
        tx,
        { organizationId, from: todayStart, to: tomorrowStart },
        this.channelAccounts,
      );
      const pendingAccept = await readOrderStatusCount(tx, organizationId, 'accept_wait');
      const lastSync = await tx.channelListing.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      });
      const todayOrderSummary: ChannelDashboardSummary['todayOrders'] =
        todayOrders.orderCount === null || todayOrders.revenue === null
          ? { count: null, revenue: null }
          : { count: todayOrders.orderCount, revenue: todayOrders.revenue };
      return {
        todayOrders: todayOrderSummary,
        pendingAccept,
        lastModifiedAt: lastSync?.updatedAt ?? null,
      } satisfies ChannelDashboardSummary;
    });
  }

  async getRevenueTrend(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RevenueTrendPoint[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await readDailyOrderFacts(tx, { organizationId, from, to });
      return rows.map(({ day, revenue, orderCount }) => ({
        day,
        revenue,
        orderCount,
      }) satisfies RevenueTrendPoint);
    });
  }

  async getProductRanking(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ProductRankingRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const facts = await readListingOptionOrderFacts(tx, { organizationId, from, to });
      const optionIds = [...new Set(facts.map((fact) => fact.listingOptionId))];
      const options = optionIds.length === 0
        ? []
        : await tx.channelListingOption.findMany({
          where: { organizationId, id: { in: optionIds } },
          select: {
            id: true,
            listing: {
              select: {
                id: true,
                organizationId: true,
                channelAccountId: true,
                externalId: true,
                channelName: true,
                displayName: true,
              },
            },
          },
        });
      const optionById = new Map(options.map((option) => [option.id, option.listing]));
      const byListing = new Map<string, {
        sellerProductId: string;
        sellerProductName: string;
        revenue: number;
        orderIds: Set<string>;
      }>();
      for (const fact of facts) {
        const listing = optionById.get(fact.listingOptionId);
        if (!listing || listing.organizationId !== organizationId
          || listing.channelAccountId !== fact.channelAccountId) continue;
        const current = byListing.get(listing.id) ?? {
          sellerProductId: listing.externalId,
          sellerProductName: listing.channelName ?? listing.displayName ?? listing.externalId,
          revenue: 0,
          orderIds: new Set<string>(),
        };
        current.revenue += fact.revenue;
        current.orderIds.add(fact.orderId);
        byListing.set(listing.id, current);
      }
      return [...byListing.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((row) => ({
          sellerProductId: row.sellerProductId,
          sellerProductName: row.sellerProductName,
          revenue: row.revenue,
          orderCount: row.orderIds.size,
        }) satisfies ProductRankingRow);
    });
  }
}
