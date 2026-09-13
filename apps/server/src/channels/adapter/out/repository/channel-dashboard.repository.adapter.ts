import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays, kstDayStart } from '../../../../common/kst';
import {
  readDailyOrderFacts,
  readListingOptionOrderFacts,
  readOrderReturnFaultFacts,
  readOrderReturnReasonFacts,
  readOrderReturnStatusCount,
  readOrderReturnWindowFacts,
  readOrderStatusCount,
  readOrderWindowFacts,
} from '../../../../orders/read/order-facts.reader';
import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
  ReturnReasonRow,
  ReturnFaultSplit,
} from '@kiditem/shared/channel-dashboard';
import type { ReturnSummary } from '@kiditem/shared/return-summary';
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
 * - `_count: true` in Prisma returns a flat `number` (no wrapper object).
 * - `OrderReturn.faultBy` is `VarChar(20)` and is currently `CUSTOMER` /
 *   `VENDOR` only; unknown values must be dropped before persistence.
 * - `getReturnSummary` counts the window's collected orders. Returns have no
 *   owner publication, so the Orders reader publishes no return count and the
 *   rate is `null`, never zero (ADR-0006).
 *
 * Canonical order SQL lives in the Orders reader. This adapter owns each
 * transaction and resolves Channels display metadata inside that transaction.
 */

@Injectable()
export class ChannelDashboardRepositoryAdapter implements ChannelDashboardRepositoryPort {
  private readonly logger = new Logger(ChannelDashboardRepositoryAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<ChannelDashboardSummary> {
    const todayStart = kstDayStart(new Date());
    const tomorrowStart = addDays(todayStart, 1);
    return this.prisma.$transaction(async (tx) => {
      const todayOrders = await readOrderWindowFacts(
        tx,
        { organizationId, from: todayStart, to: tomorrowStart },
      );
      const pendingAccept = await readOrderStatusCount(tx, organizationId, 'accept_wait');
      const pendingReturns = await readOrderReturnStatusCount(
        tx,
        organizationId,
        'return_request',
      );
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
        pendingReturns,
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

  async getReturnSummary(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnSummary> {
    const startedAt = Date.now();

    const { orderCount, returnCount, orphanReturnCount } = await this.prisma.$transaction(
      (tx) => readOrderReturnWindowFacts(tx, { organizationId, from, to }),
    );

    // A rate needs a measured return count over at least one order.
    const returnRate = returnCount === null || orderCount === 0 ? null : returnCount / orderCount;

    const result = {
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
    } satisfies ReturnSummary;

    this.logger.log({
      msg: 'channel-dashboard.getReturnSummary',
      organizationId,
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  async getReturnReasonBreakdown(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnReasonRow[]> {
    const groups = await this.prisma.$transaction((tx) =>
      readOrderReturnReasonFacts(tx, { organizationId, from, to }),
    );
    return groups.map((group) => ({ ...group }) satisfies ReturnReasonRow);
  }

  async getReturnFaultSplit(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnFaultSplit> {
    const groups = await this.prisma.$transaction((tx) =>
      readOrderReturnFaultFacts(tx, { organizationId, from, to }),
    );
    // C-11 unknown faultBy drop: faultBy is VarChar(20) — only CUSTOMER/VENDOR are reported.
    const find = (key: string) => groups.find((g) => g.faultBy === key)?.count ?? 0;
    return { customer: find('CUSTOMER'), vendor: find('VENDOR') } satisfies ReturnFaultSplit;
  }
}
