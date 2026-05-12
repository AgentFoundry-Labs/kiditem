// `ad_campaign` payloads land in three places:
//   1. `ChannelScrapeRun` + `ChannelScrapeSnapshot` per row (raw audit/replay)
//   2. `ChannelListingDailySnapshot` listing-day metrics + state when the
//      row has listing identity (matched or matched_listing_only)
//   3. `ChannelAdTargetDailySnapshot` per row at the appropriate
//      campaign/keyword/product grain
//
// Account-level KPI rows (the `_kpiOnly` summary row + any payload-level
// `kpis` map for the campaign as a whole) land in
// `ChannelAccountDailyKpiSnapshot` with `kpiType='advertising_campaign_kpis'`.
//
// Provider ratios (ROAS/CTR/CVR) are NOT trusted: only the additive
// numerator/denominator columns are stored; provider ratios survive in
// `metaJson` for audit. Reads recompute ratios.

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
  pairScrapeRows,
  toNumber,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
import { buildAdTargetKey } from '../../domain/util/ad-target-key';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/ad-account-kpi.repository.port';
import {
  CHANNEL_LISTING_DAILY_REPOSITORY_PORT,
  type ChannelListingDailyRepositoryPort,
} from '../port/out/channel-listing-daily.repository.port';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
} from '../port/out/channel-target-daily.repository.port';
import {
  addListingAdMetrics,
  flushListingAdMetrics,
  type ListingAdMetricAccumulator,
  type SummedListingAdMetrics,
} from './listing-ad-metric-accumulator';

@Injectable()
export class AdCampaignIngestHandler {
  private readonly logger = new Logger(AdCampaignIngestHandler.name);

  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_LISTING_DAILY_REPOSITORY_PORT)
    private readonly listingDailyRepo: ChannelListingDailyRepositoryPort,
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
    const campaignName = payload.campaignName || '_전체';
    const period = String(payload.period || '7d');
    const today = resolveBusinessDate(
      payload.timestamp,
      payload.dateFrom,
      payload.dateTo,
    );
    const kpis = payload.kpis || {};
    const normalizedRows = payload.normalizedRows ?? [];
    const scrapeRows = pairScrapeRows(payload.data, normalizedRows);

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'campaign',
      businessDate: today,
      periodStart: toBusinessDate(payload.dateFrom),
      periodEnd: toBusinessDate(payload.dateTo),
      targetUrl: payload.url ?? null,
      period,
      metaJson: {
        campaignName,
        kpis,
        rowCount: scrapeRows.length,
        normalizedRowCount: normalizedRows.length,
      },
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let targetDailyCount = 0;
      let accountKpiCount = 0;
      const listingAdMetrics = new Map<string, ListingAdMetricAccumulator>();

      for (const pair of scrapeRows) {
        const row = pair.normalizedRow;
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
          source: 'advertising',
          pageType: cleanString(row.pageType) || 'campaign',
          businessDate: today,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          optionId: match.optionId,
          matchStatus,
          matchReason: !pair.hasNormalizedRow
            ? 'missing normalized row (snapshot only)'
            : row._kpiOnly
              ? 'kpi-only row (snapshot only)'
              : !row.campaignName && !row.productName && !row.keyword
                ? 'missing campaign/product/keyword identity (snapshot only)'
                : null,
          rawJson: pair.rawRow as Record<string, unknown>,
          normalizedJson: pair.hasNormalizedRow
            ? (row as Record<string, unknown>)
            : null,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        if (!pair.hasNormalizedRow) continue;
        if (row._kpiOnly) continue;
        if (!row.campaignName && !row.productName && !row.keyword) continue;

        const rowCampaignName = cleanString(row.campaignName) || campaignName;
        const rowCampaignId = cleanString(row.campaignId);
        const rowAdGroup = cleanString(row.adGroup);
        const rowKeyword = cleanString(row.keyword);
        const rowStatus = cleanString(row.status);
        const rowOnOff = cleanString(row.onOff);
        const rowPageType = cleanString(row.pageType) || 'campaign';
        const rowSpend = Math.round(toNumber(row.runningAdSpend ?? row.spend));
        const rowRevenue = Math.round(toNumber(row.revenue));
        const rowImpressions = Math.round(toNumber(row.impressions));
        const rowClicks = Math.round(toNumber(row.clicks));
        const rowConversions = Math.round(toNumber(row.conversions));
        const rowOrders = Math.round(toNumber(row.orders));
        const rowDailyBudget = toNumberOrNull(row.dailyBudget);
        const rowCurrentBid = toNumberOrNull(row.currentBid);
        const providerRoas = toNumber(row.roas || row.adEfficiencyTarget);
        const providerCtr = toNumber(row.ctr);
        const providerConversionRate = toNumber(row.conversionRate);

        // Listing-day metric upsert when listing identity is known.
        if (match.listingId && match.externalId) {
          const adMetrics: SummedListingAdMetrics = {
            adSpend: rowSpend,
            adRevenue: rowRevenue,
            adImpressions: rowImpressions,
            adClicks: rowClicks,
            adConversions: rowConversions,
            adOrders: rowOrders,
          };
          addListingAdMetrics(listingAdMetrics, {
            organizationId,
            listingId: match.listingId,
            channel: 'coupang',
            externalId: match.externalId,
            businessDate: today,
            rawSnapshotId: snapshot.id,
            productName: cleanString(row.productName),
            metaSource: 'advertising.campaign',
            metaRow: {
              campaignName: rowCampaignName,
              providerRoas,
              providerCtr,
              providerConversionRate,
            },
            metrics: adMetrics,
          });
        }

        // Target-day fact: prefer the most specific grain available on the row.
        const targetType = deriveAdTargetType(rowPageType, rowKeyword);
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
            businessDate: today,
            targetType,
            targetKey,
            listingId: match.listingId ?? null,
            listingOptionId: match.listingOptionId ?? null,
            optionId: match.optionId ?? null,
            externalId: externalIdRaw ?? match.externalId ?? null,
            externalOptionId:
              externalOptionIdRaw ?? match.externalOptionId ?? null,
            campaignId: rowCampaignId,
            campaignName: rowCampaignName,
            adGroup: rowAdGroup,
            keyword: rowKeyword,
            placement: cleanString(row.placement),
            status: rowStatus,
            onOff: rowOnOff,
            currentBid: rowCurrentBid,
            dailyBudget: rowDailyBudget,
            rawSnapshotId: snapshot.id,
            metaJson: {
              source: 'advertising.campaign.target',
              data: {
                providerRoas,
                providerCtr,
                providerConversionRate,
                pageType: rowPageType,
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
          // Non-buildable identity (e.g., neither campaignId nor campaignName
          // present) — raw snapshot is preserved above. Skip target daily so
          // we never land an `unknown:unknown` row.
          this.logger.debug(
            `ingestAdCampaign skipped target daily upsert: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }

      listingDailyCount += await flushListingAdMetrics(
        this.listingDailyRepo,
        listingAdMetrics,
      );

      // Account-level KPI fact for the campaign-as-a-whole. Provider ROAS /
      // CTR / CVR live inside `metaJson`/`normalizedJson` only — reads
      // recompute from additive numerators downstream.
      if (Object.keys(kpis).length > 0) {
        const kpiRecord: Record<string, unknown> = {
          kpis,
          campaignName,
          period,
          rowCount: scrapeRows.length,
        };
        await this.accountKpiRepo.upsertAccountKpi({
          organizationId,
          channel: 'coupang',
          source: 'advertising',
          kpiType: 'advertising_campaign_kpis',
          businessDate: today,
          periodStart: toBusinessDate(payload.dateFrom),
          periodEnd: toBusinessDate(payload.dateTo),
          normalizedJson: kpiRecord,
          rawJson: kpiRecord,
        });
        accountKpiCount += 1;
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
        type: 'ad_campaign',
        campaignName,
        period,
        kpiCount: Object.keys(kpis).length,
        listingDailyCount,
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
