// Hydrates every input the strategy sub-services need from
// `ChannelListingDailySnapshot` and friends. The adapter does NOT fetch
// `AdsConfig` — the application service passes it in as a parameter so
// this lane has zero application-layer back-references.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart, kstMonthStart } from '../../../../common/kst';
import { readListingAdWindowFacts } from '../../../../common/ad-window-facts';
import {
  buildPerListingMetrics,
  readAdEvidenceFromLedger,
} from '../../../../common/per-listing-profit';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import {
  buildGradeMap,
  toAdAggregateRows,
  uniqueIds,
} from '../../../domain/strategy-context';
import {
  ADVERTISING_REVIEW_LISTING_STATS_PORT,
  type AdvertisingReviewListingStatsPort,
} from '../../../application/port/out/cross-domain/review-listing-stats.port';
import type {
  AdsConfig,
  HydratedListing,
} from '../../../domain/model/strategy-types';
import type {
  AdStrategyContextRepositoryPort,
  AllTimeAdAggregateRow,
  ExposureAnalysisContext,
  ListingReviewStatRow,
  ListingTrafficDailyRow,
  StrategyContext,
} from '../../../application/port/out/repository/ad-strategy-context.repository.port';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';

@Injectable()
export class AdStrategyContextRepositoryAdapter
  implements AdStrategyContextRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ADVERTISING_REVIEW_LISTING_STATS_PORT)
    private readonly reviewStatsRead: AdvertisingReviewListingStatsPort,
  ) {}

  async loadStrategyContext(
    organizationId: string,
    year: number,
    month: number,
    period: AdPeriod,
    config: AdsConfig,
  ): Promise<StrategyContext> {
    const range = periodBounds(period);

    const [adAgg, trafficAgg] = await Promise.all([
      // The period's `to` is an inclusive business date; the reader's window
      // is half-open, so the bound is the day after.
      readListingAdWindowFacts(this.prisma, {
        organizationId,
        from: range.from,
        to: new Date(range.to.getTime() + 86_400_000),
      }),
      this.prisma.channelListingDailySnapshot.findMany({
        where: {
          organizationId,
          businessDate: { gte: range.from, lte: range.to },
        },
        select: {
          listingId: true,
          businessDate: true,
          trafficRevenue: true,
          trafficOrders: true,
          trafficObservedAt: true,
        },
      }),
    ]);

    const listingIds = uniqueIds([
      ...adAgg.map((a) => a.listingId),
    ]);
    const listingIdSet = new Set(listingIds);
    const monthWindow = {
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };

    const listings = await this.hydrateListings(organizationId, listingIds);
    const [liveMetrics, channelStateByListing] = await Promise.all([
      listingIds.length === 0
        ? Promise.resolve([])
        : readAdEvidenceFromLedger(
            this.prisma,
            organizationId,
            monthWindow.from,
            monthWindow.to,
          ).then((accountAdEvidence) => buildPerListingMetrics(
            this.prisma,
            organizationId,
            monthWindow.from,
            monthWindow.to,
            accountAdEvidence,
          )).then((rows) =>
            rows.filter((row) => listingIdSet.has(row.listingId)),
          ),
      this.loadChannelStateByListing(organizationId, listings),
    ]);

    // Only listings whose profit is measured enter the strategy context. A
    // listing with incomplete ad coverage is absent rather than carrying a
    // profit rate derived from a partial ad sum (ADR-0003).
    const profitRateByListing = new Map<string, number>(
      liveMetrics.map((metric) => [metric.listingId, metric.profitRate]),
    );

    const trafficByListing = new Map<
      string,
      { revenue: number; orders: number }
    >();
    for (const row of trafficAgg) {
      // A traffic row is a measurement only on a day the source reported.
      if (!row.listingId || row.trafficObservedAt === null) continue;
      const current = trafficByListing.get(row.listingId) ?? { revenue: 0, orders: 0 };
      current.revenue += row.trafficRevenue;
      current.orders += row.trafficOrders;
      trafficByListing.set(row.listingId, current);
    }

    return {
      adGroups: toAdAggregateRows(adAgg),
      adIssuesAdGroups: toAdAggregateRows(adAgg),
      listings,
      profitRateByListing,
      channelStateByListing,
      gradeMap: buildGradeMap(listings),
      trafficByListing,
      config,
    };
  }

  async loadChannelStateByListing(
    organizationId: string,
    listings: HydratedListing[],
  ): Promise<Map<string, ChannelStateSignal>> {
    const map = new Map<string, ChannelStateSignal>();
    if (listings.length === 0) return map;

    const listingIds = listings.map((l) => l.id);
    const primaryListingOptionByListing = new Map<string, string>();
    for (const l of listings) {
      if (l.primaryOption) {
        primaryListingOptionByListing.set(l.id, l.primaryOption.listingOptionId);
      }
    }
    const primaryListingOptionIds = Array.from(
      primaryListingOptionByListing.values(),
    );

    type ListingDailyRow = {
      listingId: string;
      channel: string;
      externalId: string;
      businessDate: Date;
      lastObservedAt: Date;
      sampleCount: number;
      productName: string | null;
      status: string | null;
      exposureStatus: string | null;
      saleStatus: string | null;
      channelPrice: number | null;
      isOfferWinner: boolean | null;
      myPrice: number | null;
      winnerPrice: number | null;
      winnerGapPrice: number | null;
      productRank: number | null;
      categoryRank: number | null;
    };
    type OptionDailyRow = {
      listingId: string;
      listingOptionId: string;
      externalOptionId: string;
      businessDate: Date;
      optionName: string | null;
      saleStatus: string | null;
      isActive: boolean | null;
      salePrice: number | null;
      stockQty: number | null;
      isOfferWinner: boolean | null;
      myPrice: number | null;
      winnerPrice: number | null;
      winnerGapPrice: number | null;
    };

    const [listingDailies, optionDailies] = await Promise.all([
      this.prisma.$queryRaw<ListingDailyRow[]>(Prisma.sql`
        SELECT DISTINCT ON (listing_id)
          listing_id          AS "listingId",
          channel,
          external_id         AS "externalId",
          business_date       AS "businessDate",
          last_observed_at    AS "lastObservedAt",
          sample_count        AS "sampleCount",
          product_name        AS "productName",
          status,
          exposure_status     AS "exposureStatus",
          sale_status         AS "saleStatus",
          channel_price       AS "channelPrice",
          is_offer_winner     AS "isOfferWinner",
          my_price            AS "myPrice",
          winner_price        AS "winnerPrice",
          winner_gap_price    AS "winnerGapPrice",
          product_rank        AS "productRank",
          category_rank       AS "categoryRank"
        FROM channel_listing_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
          AND listing_id = ANY(${listingIds}::uuid[])
        ORDER BY
          listing_id,
          business_date DESC,
          last_observed_at DESC NULLS LAST,
          updated_at DESC NULLS LAST,
          id DESC
      `),
      primaryListingOptionIds.length === 0
        ? Promise.resolve([] as OptionDailyRow[])
        : this.prisma.$queryRaw<OptionDailyRow[]>(Prisma.sql`
            SELECT DISTINCT ON (listing_option_id)
              listing_id           AS "listingId",
              listing_option_id    AS "listingOptionId",
              external_option_id   AS "externalOptionId",
              business_date        AS "businessDate",
              option_name          AS "optionName",
              sale_status          AS "saleStatus",
              is_active            AS "isActive",
              sale_price           AS "salePrice",
              stock_qty            AS "stockQty",
              is_offer_winner      AS "isOfferWinner",
              my_price             AS "myPrice",
              winner_price         AS "winnerPrice",
              winner_gap_price     AS "winnerGapPrice"
            FROM channel_listing_option_daily_snapshots
            WHERE organization_id = ${organizationId}::uuid
              AND listing_option_id = ANY(${primaryListingOptionIds}::uuid[])
            ORDER BY
              listing_option_id,
              business_date DESC,
              last_observed_at DESC NULLS LAST,
              updated_at DESC NULLS LAST,
              id DESC
          `),
    ]);

    const optionByListing = new Map<string, OptionDailyRow>();
    for (const row of optionDailies) {
      if (!optionByListing.has(row.listingId)) {
        optionByListing.set(row.listingId, row);
      }
    }

    for (const ld of listingDailies) {
      const od = optionByListing.get(ld.listingId);
      const signal: ChannelStateSignal = {
        channel: ld.channel,
        externalId: ld.externalId,
        businessDate: ld.businessDate.toISOString().slice(0, 10),
        lastObservedAt: ld.lastObservedAt.toISOString(),
        sampleCount: ld.sampleCount,
        productName: ld.productName,
        status: ld.status,
        exposureStatus: ld.exposureStatus,
        saleStatus: ld.saleStatus,
        channelPrice: ld.channelPrice,
        isOfferWinner: ld.isOfferWinner,
        myPrice: ld.myPrice,
        winnerPrice: ld.winnerPrice,
        winnerGapPrice: ld.winnerGapPrice,
        productRank: ld.productRank,
        categoryRank: ld.categoryRank,
        primaryOption: od
          ? {
              listingOptionId: od.listingOptionId,
              externalOptionId: od.externalOptionId,
              optionName: od.optionName,
              saleStatus: od.saleStatus,
              isActive: od.isActive,
              salePrice: od.salePrice,
              stockQty: od.stockQty,
              isOfferWinner: od.isOfferWinner,
              myPrice: od.myPrice,
              winnerPrice: od.winnerPrice,
              winnerGapPrice: od.winnerGapPrice,
            }
          : null,
      };
      map.set(ld.listingId, signal);
    }

    return map;
  }

  async hydrateListings(
    organizationId: string,
    listingIds: string[],
  ): Promise<HydratedListing[]> {
    if (listingIds.length === 0) return [];
    const rows = await this.prisma.channelListing.findMany({
      where: {
        id: { in: listingIds },
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        channelName: true,
        displayName: true,
        masterProduct: {
          select: {
            id: true,
            code: true,
            name: true,
            abcGrade: true,
            adTier: true,
            healthScore: true,
          },
        },
        options: {
          where: { isActive: true },
          orderBy: [
            { createdAt: 'asc' },
            { externalOptionId: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            salePrice: true,
            costPriceOverride: true,
            commissionRate: true,
            shippingCost: true,
          },
        },
      },
    });
    return rows
      .map((r): HydratedListing => {
        const firstClo = r.options[0] ?? null;
        return {
          id: r.id,
          externalId: r.externalId,
          channelName: r.channelName,
          masterProduct: {
            id: r.masterProduct?.id ?? r.id,
            code: r.masterProduct?.code ?? r.externalId,
            name: r.masterProduct?.name ?? r.displayName ?? r.channelName ?? r.externalId,
            abcGrade:
              r.masterProduct?.abcGrade === 'A'
                || r.masterProduct?.abcGrade === 'B'
                || r.masterProduct?.abcGrade === 'C'
                ? r.masterProduct.abcGrade
                : null,
            adTier: r.masterProduct?.adTier ?? null,
            healthScore: r.masterProduct?.healthScore ?? null,
          },
          primaryOption: firstClo
            ? {
                listingOptionId: firstClo.id,
                sellableStock: null,
                purchaseCost: firstClo.costPriceOverride,
                salePrice: firstClo.salePrice,
                commissionRate: firstClo.commissionRate,
                shippingCost: firstClo.shippingCost,
              }
            : null,
        };
      })
      ;
  }

  async loadAllTimeAdAggregates(
    organizationId: string,
  ): Promise<AllTimeAdAggregateRow[]> {
    const rows = await readListingAdWindowFacts(this.prisma, { organizationId });
    return rows.map((row) => ({
      listingId: row.listingId,
      spend: row.spend,
      revenue: row.revenue,
      clicks: row.clicks,
      impressions: row.impressions,
      conversions: row.conversions,
    }));
  }

  async loadExposureAnalysisContext(
    organizationId: string,
    listingIds: string[],
    options: { recentReviewSince: Date; trafficSince: Date },
  ): Promise<ExposureAnalysisContext> {
    if (listingIds.length === 0) {
      return {
        adAggAll: [],
        reviewStats: [],
        recentReviewCounts: [],
        trafficDailyRows: [],
      };
    }
    const [adAggAll, reviewStatsRead, trafficDailyRows] =
      await Promise.all([
        this.loadAllTimeAdAggregates(organizationId),
        this.reviewStatsRead.loadListingReviewStats({
          organizationId,
          listingIds,
          recentSince: options.recentReviewSince,
        }),
        this.prisma.channelListingDailySnapshot.findMany({
          where: {
            organizationId,
            listingId: { in: listingIds },
            businessDate: { gte: options.trafficSince },
          },
          select: {
            listingId: true,
            businessDate: true,
            trafficRevenue: true,
            trafficOrders: true,
            trafficObservedAt: true,
          },
        }),
      ]);

    const reviewStats: ListingReviewStatRow[] = reviewStatsRead.lifetime;
    const recentReviewCounts = reviewStatsRead.recent;
    const trafficRows: ListingTrafficDailyRow[] = trafficDailyRows.flatMap(
      (row) =>
        row.listingId && row.trafficObservedAt !== null
          ? [
              {
                listingId: row.listingId,
                businessDate: row.businessDate,
                trafficRevenue: row.trafficRevenue,
                trafficOrders: row.trafficOrders,
              },
            ]
          : [],
    );

    return {
      adAggAll,
      reviewStats,
      recentReviewCounts,
      trafficDailyRows: trafficRows,
    };
  }

}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
