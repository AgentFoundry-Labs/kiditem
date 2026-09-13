// Hydrates every input the strategy sub-services need from
// `ChannelListingDailySnapshot` and friends. The adapter does NOT fetch
// `AdsConfig` — the application service passes it in as a parameter so
// this lane has zero application-layer back-references.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays, businessDateKey, kstInclusiveDaysStart, kstMonthStart } from '../../../../common/kst';
import { readListingAdWindowFacts } from '../../../../common/ad-window-facts';
import { currentRowTieBreakSql } from '../../../../common/current-row';
import {
  readListingTrafficWindowFacts,
  readLatestListingStateFacts,
} from '../../../../channels/read/channel-listing-daily-facts';
import { readPublishedProductAbcGrades } from '../../../../products/read/product-abc-publication.reader';
import {
  buildPerListingMetricsCoverage,
  readAdEvidenceFromLedger,
  type PerListingMetrics,
} from '../../../../common/per-listing-profit';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import {
  buildGradeMap,
  toAdAggregateRows,
  uniqueIds,
} from '../../../domain/strategy-context';
import type {
  AdsConfig,
  HydratedListing,
} from '../../../domain/model/strategy-types';
import type {
  AdStrategyContextRepositoryPort,
  StrategyContext,
} from '../../../application/port/out/repository/ad-strategy-context.repository.port';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';

@Injectable()
export class AdStrategyContextRepositoryAdapter
  implements AdStrategyContextRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadStrategyContext(
    organizationId: string,
    year: number,
    month: number,
    period: AdPeriod,
    config: AdsConfig,
  ): Promise<StrategyContext> {
    return this.prisma.$transaction(
      (tx) => this.loadStrategyContextIn(
        tx,
        organizationId,
        year,
        month,
        period,
        config,
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async loadStrategyContextIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
    year: number,
    month: number,
    period: AdPeriod,
    config: AdsConfig,
  ): Promise<StrategyContext> {
    const range = periodBounds(period);

    // The period's `to` is an inclusive business date; both readers take a
    // half-open window, so the bound is the day after.
    const windowEnd = addDays(range.to, 1);
    const adAgg = await readListingAdWindowFacts(tx, {
      organizationId,
      from: range.from,
      to: windowEnd,
    });

    const listingIds = uniqueIds([
      ...adAgg.map((a) => a.listingId),
    ]);
    const listingIdSet = new Set(listingIds);
    const trafficAgg = await readListingTrafficWindowFacts(tx, {
      organizationId,
      from: range.from,
      to: windowEnd,
      listingIds,
    });
    const monthWindow = {
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
    const listings = await this.hydrateListingsIn(tx, organizationId, listingIds);
    let liveMetrics: PerListingMetrics[] = [];
    let profitWithheldListings = 0;
    if (listingIds.length > 0) {
      const accountAdEvidence = await readAdEvidenceFromLedger(
        tx,
        organizationId,
        monthWindow.from,
        monthWindow.to,
      );
      // The coverage variant says how many context listings were withheld, so
      // the plan does not reason over a silent subset.
      const coverage = await buildPerListingMetricsCoverage(
        tx,
        organizationId,
        monthWindow.from,
        monthWindow.to,
        accountAdEvidence,
        listingIdSet,
      );
      liveMetrics = coverage.metrics;
      profitWithheldListings = coverage.withheldListings;
    }
    const channelStateByListing = await this.loadChannelStateByListingIn(
      tx,
      organizationId,
      listings,
    );

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
    const includedTrafficDates = new Set(trafficAgg.coverage.includedDates);
    for (const row of trafficAgg.rows) {
      if (!includedTrafficDates.has(row.businessDate)) continue;
      const current = trafficByListing.get(row.listingId) ?? { revenue: 0, orders: 0 };
      current.revenue += row.revenue;
      current.orders += row.orders;
      trafficByListing.set(row.listingId, current);
    }

    return {
      adGroups: toAdAggregateRows(adAgg),
      adIssuesAdGroups: toAdAggregateRows(adAgg),
      listings,
      profitRateByListing,
      profitWithheldListings,
      channelStateByListing,
      gradeMap: buildGradeMap(listings),
      trafficByListing,
      config,
    };
  }

  private async loadChannelStateByListingIn(
    tx: Prisma.TransactionClient,
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

    const listingDailies = await readLatestListingStateFacts(tx, { organizationId, listingIds });
    const optionDailies = primaryListingOptionIds.length === 0
      ? [] as OptionDailyRow[]
      : await tx.$queryRaw<OptionDailyRow[]>(Prisma.sql`
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
              ${currentRowTieBreakSql({
                businessDate: Prisma.sql`business_date`,
                observedAt: Prisma.sql`last_observed_at`,
                updatedAt: Prisma.sql`updated_at`,
                id: Prisma.sql`id`,
              })}
          `);

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
        businessDate: businessDateKey(ld.businessDate),
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

  private async hydrateListingsIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
    listingIds: string[],
  ): Promise<HydratedListing[]> {
    if (listingIds.length === 0) return [];
    const rows = await tx.channelListing.findMany({
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
        channelAccount: { select: { channel: true } },
        masterProduct: {
          select: {
            id: true,
            code: true,
            name: true,
            adTier: true,
          },
        },
        options: {
          where: { isActive: true },
          orderBy: [
            { createdAt: 'asc' },
            { externalOptionId: 'asc' },
            { id: 'asc' },
          ],
          // Purchase cost is the confirmed recipe priced at the Sellpia
          // purchase price, applied from Channels availability; option cost
          // columns are not a cost source (KID-114).
          select: {
            id: true,
            salePrice: true,
          },
        },
      },
    });
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds: rows.flatMap((row) => row.masterProduct ? [row.masterProduct.id] : []),
    });
    return rows
      .map((r): HydratedListing => {
        const firstClo = r.options[0] ?? null;
        return {
          id: r.id,
          externalId: r.externalId,
          channelName: r.channelName,
          channel: r.channelAccount?.channel ?? null,
          masterProduct: {
            id: r.masterProduct?.id ?? r.id,
            code: r.masterProduct?.code ?? r.externalId,
            name: r.masterProduct?.name ?? r.displayName ?? r.channelName ?? r.externalId,
            abcGrade: r.masterProduct
              ? gradeByProductId.get(r.masterProduct.id) ?? null
              : null,
            adTier: r.masterProduct?.adTier ?? null,
          },
          primaryOption: firstClo
            ? {
                listingOptionId: firstClo.id,
                sellableStock: null,
                purchaseCost: null,
                salePrice: firstClo.salePrice,
              }
            : null,
        };
      })
      ;
  }
}
