// Hydrates every input the strategy sub-services need from
// `ChannelListingDailySnapshot` and friends. The adapter does NOT fetch
// `AdsConfig` — the application service passes it in as a parameter so
// this lane has zero application-layer back-references.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart, kstMonthStart } from '../../../../common/kst';
import { buildPerListingMetrics } from '../../../../common/per-listing-profit';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';
import type {
  AdsConfig,
  HydratedListing,
} from '../../../domain/model/strategy-types';
import {
  buildGradeMap,
  toAdAggregateRows,
  uniqueIds,
} from '../../../domain/strategy-context';
import type {
  AdStrategyContextRepositoryPort,
  AllTimeAdAggregateRow,
  ExposureAnalysisContext,
  ListingReviewStatRow,
  ListingTrafficDailyRow,
  StrategyContext,
} from '../../../application/port/out/repository/ad-strategy-context.repository.port';

@Injectable()
export class AdStrategyContextRepositoryAdapter
  implements AdStrategyContextRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadStrategyContext(
    organizationId: string,
    year: number,
    month: number,
    config: AdsConfig,
  ): Promise<StrategyContext> {
    const since14d = kstInclusiveDaysStart(14);

    const [adAggAll, adAgg14d, trafficAggAll] = await Promise.all([
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        where: { organizationId },
        _sum: {
          adSpend: true,
          adRevenue: true,
          adClicks: true,
          adImpressions: true,
          adConversions: true,
        },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        where: { organizationId, businessDate: { gte: since14d } },
        _sum: {
          adSpend: true,
          adRevenue: true,
          adClicks: true,
          adImpressions: true,
          adConversions: true,
        },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        where: { organizationId, businessDate: { gte: since14d } },
        _sum: {
          trafficRevenue: true,
          trafficOrders: true,
        },
      }),
    ]);

    const listingIds = uniqueIds([
      ...adAggAll.map((a) => a.listingId),
      ...adAgg14d.map((a) => a.listingId),
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
        : buildPerListingMetrics(
            this.prisma,
            organizationId,
            monthWindow.from,
            monthWindow.to,
          ).then((rows) =>
            rows.filter((row) => listingIdSet.has(row.listingId)),
          ),
      this.loadChannelStateByListing(organizationId, listings),
    ]);

    const profitRateByListing = new Map<string, number>(
      liveMetrics.map((metric) => [metric.listingId, metric.profitRate]),
    );

    const trafficByListing = new Map<
      string,
      { revenue: number; orders: number }
    >();
    for (const row of trafficAggAll) {
      if (!row.listingId) continue;
      trafficByListing.set(row.listingId, {
        revenue: row._sum.trafficRevenue ?? 0,
        orders: row._sum.trafficOrders ?? 0,
      });
    }

    return {
      adGroups: toAdAggregateRows(adAggAll),
      adIssuesAdGroups: toAdAggregateRows(adAgg14d),
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
    const rows = await this.prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: { organizationId },
      _sum: {
        adSpend: true,
        adRevenue: true,
        adClicks: true,
        adImpressions: true,
        adConversions: true,
      },
    });
    return rows.map((row) => ({
      listingId: row.listingId,
      spend: row._sum.adSpend ?? 0,
      revenue: row._sum.adRevenue ?? 0,
      clicks: row._sum.adClicks ?? 0,
      impressions: row._sum.adImpressions ?? 0,
      conversions: row._sum.adConversions ?? 0,
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
    const [adAggAll, reviewAgg, recentReviewAgg, trafficDailyRows] =
      await Promise.all([
        this.loadAllTimeAdAggregates(organizationId),
        this.prisma.review.groupBy({
          by: ['listingId'],
          where: { organizationId, listingId: { not: null } },
          _count: { id: true },
          _avg: { rating: true },
        }),
        this.prisma.review.groupBy({
          by: ['listingId'],
          where: {
            organizationId,
            listingId: { not: null },
            reviewedAt: { gte: options.recentReviewSince },
          },
          _count: { id: true },
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
          },
        }),
      ]);

    const reviewStats: ListingReviewStatRow[] = reviewAgg.flatMap((r) =>
      r.listingId
        ? [
            {
              listingId: r.listingId,
              totalReviews: r._count.id,
              avgRating: r._avg.rating != null ? Number(r._avg.rating) : 0,
            },
          ]
        : [],
    );
    const recentReviewCounts = recentReviewAgg.flatMap((r) =>
      r.listingId ? [{ listingId: r.listingId, count: r._count.id }] : [],
    );
    const trafficRows: ListingTrafficDailyRow[] = trafficDailyRows.flatMap(
      (row) =>
        row.listingId
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
