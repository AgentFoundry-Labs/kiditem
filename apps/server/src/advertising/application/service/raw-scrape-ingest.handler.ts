// `raw_scrape` covers both wing item-winner rows and advertising dashboard
// rows. Each row creates a `ChannelScrapeSnapshot` first; matched rows
// then upsert listing/option daily state (winner state) for wing, and
// listing-day ad metrics + target-day fact for advertising. Wing
// dashboard KPI cards land in `ChannelAccountDailyKpiSnapshot`.
//
// Unknown sources still snapshot every row (raw preservation principle)
// without any daily-fact upsert.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import {
  resolveBusinessDate,
  toBusinessDate,
} from '../../domain/business-date';
import {
  matchListingFromRow,
  matchStatusOf,
  pickStringField,
  type ListingMap,
} from '../../domain/listing-match';
import {
  cleanString,
  deriveAdTargetType,
  normalizeWingListingState,
  normalizeWingOptionState,
  pairScrapeRows,
  toNumber,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
import { buildAdTargetKey } from '../../domain/util/ad-target-key';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/repository/ad-account-kpi.repository.port';
import {
  CHANNEL_LISTING_DAILY_REPOSITORY_PORT,
  type ChannelListingDailyRepositoryPort,
} from '../port/out/repository/channel-listing-daily.repository.port';
import {
  CHANNEL_OPTION_DAILY_REPOSITORY_PORT,
  type ChannelOptionDailyRepositoryPort,
} from '../port/out/repository/channel-option-daily.repository.port';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
} from '../port/out/repository/channel-target-daily.repository.port';
import {
  addListingAdMetrics,
  flushListingAdMetrics,
  type ListingAdMetricAccumulator,
} from './listing-ad-metric-accumulator';

@Injectable()
export class RawScrapeIngestHandler {
  private readonly logger = new Logger(RawScrapeIngestHandler.name);

  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_LISTING_DAILY_REPOSITORY_PORT)
    private readonly listingDailyRepo: ChannelListingDailyRepositoryPort,
    @Inject(CHANNEL_OPTION_DAILY_REPOSITORY_PORT)
    private readonly optionDailyRepo: ChannelOptionDailyRepositoryPort,
    @Inject(CHANNEL_TARGET_DAILY_REPOSITORY_PORT)
    private readonly targetDailyRepo: ChannelTargetDailyRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
  ) {}

  async execute(
    payload: ExtensionSyncDto,
    organizationId: string,
    map: ListingMap,
  ) {
    const source = payload.source || 'unknown';
    const rows = payload.data ?? [];
    const normalizedRowsAll = payload.normalizedRows ?? [];

    const businessDate = resolveBusinessDate(
      payload.timestamp,
      payload.startDate,
      payload.dateFrom,
      payload.dateTo,
    );
    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channelAccountId: map.channelAccountId,
      channel: 'coupang',
      source,
      pageType: source === 'wing' ? 'itemwinner' : 'advertising',
      businessDate,
      periodStart: toBusinessDate(payload.dateFrom),
      periodEnd: toBusinessDate(payload.dateTo),
      targetUrl: payload.url ?? null,
      metaJson: {
        kpis: payload.kpis ?? {},
        rowCount: rows.length,
        normalizedRowCount: normalizedRowsAll.length,
      },
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let optionDailyCount = 0;
      let targetDailyCount = 0;
      let accountKpiCount = 0;
      const listingAdMetrics = new Map<string, ListingAdMetricAccumulator>();

      if (source === 'wing') {
        for (const row of rows) {
          const productName = row.productName || '';
          const match = matchListingFromRow(row, map);
          const matchStatus = matchStatusOf(match);
          const externalIdRaw = pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          const snapshot = await this.scrapeRepo.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            organizationId,
            channel: 'coupang',
            source: 'wing',
            pageType: 'itemwinner',
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            matchStatus,
            matchReason:
              !productName || productName.length < 3
                ? 'short-product-name (snapshot only)'
                : null,
            rawJson: row as Record<string, unknown>,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;

          // Daily fact upsert for matched rows. Winner state is valuable
          // even when productName is short (no legacy filter applied).
          if (match.listingId && businessDate) {
            const listingState = normalizeWingListingState(row);
            if (listingState) {
              await this.listingDailyRepo.upsert({
                organizationId,
                listingId: match.listingId,
                channel: 'coupang',
                externalId: match.externalId ?? externalIdRaw ?? '',
                businessDate,
                rawSnapshotId: snapshot.id,
                ...listingState,
              });
              listingDailyCount += 1;
            }
            if (match.listingOptionId) {
              const optionState = normalizeWingOptionState(row);
              if (optionState) {
                await this.optionDailyRepo.upsert({
                  organizationId,
                  listingId: match.listingId,
                  listingOptionId: match.listingOptionId,
                  channel: 'coupang',
                  externalId: match.externalId ?? externalIdRaw ?? '',
                  externalOptionId:
                    match.externalOptionId ?? externalOptionIdRaw ?? '',
                  businessDate,
                  rawSnapshotId: snapshot.id,
                  ...optionState,
                });
                optionDailyCount += 1;
              }
            }
          }
        }

        const kpis = payload.kpis || {};
        if (Object.keys(kpis).length > 0 && businessDate) {
          await this.accountKpiRepo.upsertAccountKpi({
            organizationId,
            channelAccountId: map.channelAccountId,
            channel: 'coupang',
            source: 'wing',
            kpiType: 'wing_itemwinner_kpi',
            businessDate,
            normalizedJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            },
            rawJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            },
          });
          accountKpiCount += 1;
        }
      }

      const normalizedRows = payload.normalizedRows ?? [];
      const advertisingScrapeRows = pairScrapeRows(rows, normalizedRows);
      if (source === 'advertising' && advertisingScrapeRows.length > 0) {
        for (const pair of advertisingScrapeRows) {
          const row = pair.normalizedRow;
          const match = matchListingFromRow(row, map);
          const matchStatus = matchStatusOf(match);

          const pageType = cleanString(row.pageType) || 'campaign';
          const externalIdRaw = pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          const snapshot = await this.scrapeRepo.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            organizationId,
            channel: 'coupang',
            source: 'advertising',
            pageType,
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            matchStatus,
            matchReason: pair.hasNormalizedRow
              ? null
              : 'missing normalized row (snapshot only)',
            rawJson: pair.rawRow as Record<string, unknown>,
            normalizedJson: pair.hasNormalizedRow
              ? (row as Record<string, unknown>)
              : null,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;

          if (!pair.hasNormalizedRow) continue;

          const rowCampaignName = cleanString(row.campaignName);
          const rowCampaignId = cleanString(row.campaignId);
          const rowAdGroup = cleanString(row.adGroup);
          const rowKeyword = cleanString(row.keyword);
          const rowSpend = Math.round(toNumber(row.spend));
          const rowRevenue = Math.round(toNumber(row.revenue));
          const rowImpressions = Math.round(toNumber(row.impressions));
          const rowClicks = Math.round(toNumber(row.clicks));
          const rowConversions = Math.round(toNumber(row.conversions));
          const rowOrders = Math.round(toNumber(row.orders));
          const providerRoas = toNumber(row.roas);
          const providerCtr = toNumber(row.ctr);

          // Listing-day metric upsert when listing identity is known.
          if (match.listingId && match.externalId) {
            addListingAdMetrics(listingAdMetrics, {
              organizationId,
              listingId: match.listingId,
              channel: 'coupang',
              externalId: match.externalId,
              businessDate,
              rawSnapshotId: snapshot.id,
              productName: cleanString(row.productName),
              metaSource: 'advertising.raw',
              metaRow: {
                campaignName: rowCampaignName,
                providerRoas,
                providerCtr,
              },
              metrics: {
                adSpend: rowSpend,
                adRevenue: rowRevenue,
                adImpressions: rowImpressions,
                adClicks: rowClicks,
                adConversions: rowConversions,
                adOrders: rowOrders,
              },
            });
          }

          // Target-day fact at the row's grain.
          const targetType = deriveAdTargetType(pageType, rowKeyword);
          try {
            const targetKey = buildAdTargetKey({
              targetType,
              campaignId: rowCampaignId,
              campaignName: rowCampaignName,
              adGroup: rowAdGroup,
              keyword: rowKeyword,
              externalOptionId: externalOptionIdRaw ?? match.externalOptionId,
              externalId: externalIdRaw ?? match.externalId,
              listingId: match.listingId,
            });
            await this.targetDailyRepo.upsert({
              organizationId,
              channel: 'coupang',
              businessDate,
              targetType,
              targetKey,
              listingId: match.listingId ?? null,
              listingOptionId: match.listingOptionId ?? null,
              externalId: externalIdRaw ?? match.externalId ?? null,
              externalOptionId:
                externalOptionIdRaw ?? match.externalOptionId ?? null,
              campaignId: rowCampaignId,
              campaignName: rowCampaignName,
              adGroup: rowAdGroup,
              keyword: rowKeyword,
              placement: cleanString(row.placement),
              status: cleanString(row.status),
              onOff: cleanString(row.onOff),
              currentBid: toNumberOrNull(row.currentBid),
              dailyBudget: toNumberOrNull(row.dailyBudget),
              rawSnapshotId: snapshot.id,
              metaJson: {
                source: 'advertising.raw.target',
                data: {
                  providerRoas,
                  providerCtr,
                  pageType,
                  productName: cleanString(row.productName),
                  imageUrl: cleanString(row.imageUrl),
                  productUrl: cleanString(row.productUrl),
                  saleType: cleanString(row.saleType),
                },
              },
              spend: rowSpend,
              revenue: rowRevenue,
              impressions: rowImpressions,
              clicks: rowClicks,
              conversions: rowConversions,
              orders: rowOrders,
              adSpend: rowSpend,
              adRevenue: rowRevenue,
            });
            targetDailyCount += 1;
          } catch (e) {
            this.logger.debug(
              `ingestRawScrape advertising skipped target daily upsert: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
      }

      listingDailyCount += await flushListingAdMetrics(
        this.listingDailyRepo,
        listingAdMetrics,
      );

      // Unknown source fallback. Snapshot every row as unmatched.
      if (source !== 'wing' && source !== 'advertising') {
        for (const row of rows) {
          const match = matchListingFromRow(row, map);
          const matchStatus = matchStatusOf(match);
          const externalIdRaw = pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          await this.scrapeRepo.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            organizationId,
            channel: 'coupang',
            source,
            pageType: 'unknown',
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            matchStatus,
            matchReason: `unknown source '${source}' — raw preserved`,
            rawJson: row as Record<string, unknown>,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;
        }
      }

      await this.scrapeRepo.finalizeRun({
        scrapeRunId: scrapeRun.id,
        organizationId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
      });

      return {
        success: true,
        type: 'raw_scrape',
        source,
        rowCount: rows.length,
        kpiCount: Object.keys(payload.kpis || {}).length,
        listingDailyCount,
        optionDailyCount,
        targetDailyCount,
        accountKpiCount,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
    } catch (err) {
      await this.scrapeRepo.finalizeRunOnError({
        scrapeRunId: scrapeRun.id,
        organizationId,
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
        err,
      });
      throw err;
    }
  }
}
