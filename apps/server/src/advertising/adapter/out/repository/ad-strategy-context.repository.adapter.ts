import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../ai/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
// Hydrates every input the strategy sub-services need from
// `ChannelListingDailySnapshot` and friends. The adapter does NOT fetch
// `AdsConfig` — the application service passes it in as a parameter so
// this lane has zero application-layer back-references.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays, businessDateKey, kstInclusiveDaysStart, type KstQueryWindow } from '../../../../common/kst';
import { readListingAdWindowFacts } from '../../../read/ad-target-facts';
import { currentRowTieBreakSql } from '../../../../common/current-row';
import { readPublishedProductAbcGrades } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import {
  buildPerListingMetricsCoverage,
  readAdEvidenceFromLedger,
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
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';

@Injectable()
export class AdStrategyContextRepositoryAdapter
  implements AdStrategyContextRepositoryPort
{
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  async loadStrategyContext(
    organizationId: string,
    profitWindow: KstQueryWindow,
    period: AdPeriod,
    config: AdsConfig,
  ): Promise<StrategyContext> {
    return this.prisma.$transaction(
      (tx) => this.loadStrategyContextIn(
        tx,
        organizationId,
        profitWindow,
        period,
        config,
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async loadStrategyContextIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
    profitWindow: KstQueryWindow,
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
    }, this.channelAccounts);

    const listingIds = uniqueIds([
      ...adAgg.map((a) => a.listingId),
    ]);
    const listingIdSet = new Set(listingIds);
    const trafficAgg = await this.channelListings.readTrafficWindow(ownerTransaction(tx), {
      organizationId,
      from: range.from,
      to: windowEnd,
      listingIds,
    });
    const listings = await this.hydrateListingsIn(tx, organizationId, listingIds);
    // Profit rates are evaluated over the current KST month clipped to its
    // closed days (ADR-0001), the only dates an Orders collection and the
    // campaign sweep can have covered. Whether the orders covered that window
    // is a fact about the collection rather than about these listings, so it
    // is read even when no listing advertised. The coverage variant also says
    // how many context listings were withheld, so the plan does not reason
    // over a silent subset.
    const accountAdEvidence = await readAdEvidenceFromLedger(
      tx,
      organizationId,
      profitWindow.from,
      profitWindow.to, this.channelAccounts
    );
    const coverage = await buildPerListingMetricsCoverage(
      tx,
      organizationId,
      profitWindow.from,
      profitWindow.to,
      accountAdEvidence,
      listingIdSet,
      this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
    );
    const channelStateByListing = await this.loadChannelStateByListingIn(
      tx,
      organizationId,
      listings,
    );

    // Only listings whose profit is measured enter the strategy context. A
    // listing with incomplete ad coverage is absent rather than carrying a
    // profit rate derived from a partial ad sum (ADR-0003). Short of the
    // Orders collection no listing carries one: its rows are only the orders
    // collected so far.
    const profitRateByListing = new Map<string, number>(
      coverage.orderWindowComplete
        ? coverage.metrics.map((metric) => [metric.listingId, metric.profitRate] as const)
        : [],
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
      profitWithheldListings: coverage.withheldListings,
      orderWindowComplete: coverage.orderWindowComplete,
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

    const listingDailies = await this.channelListings.readLatestState(ownerTransaction(tx), { organizationId, listingIds });
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
    const listingRows = await this.channelListings.readCatalogFacts(ownerTransaction(tx), { organizationId, listingIds, activeOnly: true }).then(rows => rows.map(row => ({ ...row, channelAccount: { channel: row.channel }, options: row.options.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.externalOptionId.localeCompare(b.externalOptionId) || a.id.localeCompare(b.id)) })));
    const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: listingRows.map((row) => row.id) });
    const rows = listingRows.map((row) => ({ ...row, masterProductId: summaries.get(row.id) ?? null }));
    const masterProductIds = [...new Set(rows.flatMap((row) =>
      row.masterProductId ? [row.masterProductId] : []))];
    const identities = await this.inventoryTransactionalRead.readSourceIdentities(
      { client: tx },
      { organizationId, selector: { kind: 'ids', values: masterProductIds } },
    );
    const identityById = new Map(identities.map((identity) => [
      identity.masterProductId,
      identity,
    ]));
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds,
    });
    return rows
      .map((r): HydratedListing => {
        const firstClo = r.options[0] ?? null;
        const identity = r.masterProductId ? identityById.get(r.masterProductId) ?? null : null;
        return {
          id: r.id,
          externalId: r.externalId,
          channelName: r.channelName,
          channel: r.channelAccount?.channel ?? null,
          masterProduct: {
            id: identity?.masterProductId ?? r.id,
            code: identity?.code ?? r.externalId,
            name: identity?.name ?? r.displayName ?? r.channelName ?? r.externalId,
            abcGrade: identity
              ? gradeByProductId.get(identity.masterProductId) ?? null
              : null,
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
