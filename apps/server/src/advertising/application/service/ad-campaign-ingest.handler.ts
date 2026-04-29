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

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ExtensionSyncDto } from '../../dto';
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
import { buildAdTargetKey } from '../../util/ad-target-key';
import {
  appendScrapeSnapshot,
  createScrapeRun,
  finalizeScrapeRun,
  finalizeScrapeRunOnError,
} from '../../adapter/out/prisma/channel-scrape-run.persistence';
import { upsertChannelAdTargetDaily } from '../../adapter/out/prisma/channel-daily-fact.persistence';
import { upsertChannelAccountKpi } from '../../adapter/out/prisma/channel-account-kpi.persistence';
import {
  addListingAdMetrics,
  flushListingAdMetrics,
  type ListingAdMetricAccumulator,
  type SummedListingAdMetrics,
} from './listing-ad-metric-accumulator';

const logger = new Logger('AdCampaignIngest');

export interface AdCampaignIngestDeps {
  prisma: PrismaService;
}

export async function ingestAdCampaign(
  payload: ExtensionSyncDto,
  companyId: string,
  map: ListingMap,
  deps: AdCampaignIngestDeps,
) {
  const { prisma } = deps;
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

  const scrapeRun = await createScrapeRun(prisma, {
    companyId,
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
    } as unknown as Prisma.InputJsonValue,
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
      const snapshot = await appendScrapeSnapshot(prisma, {
        scrapeRunId: scrapeRun.id,
        companyId,
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
        rawJson: pair.rawRow as unknown as Prisma.InputJsonValue,
        normalizedJson: pair.hasNormalizedRow
          ? (row as unknown as Prisma.InputJsonValue)
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
          companyId,
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
          externalId: externalIdRaw ?? match.externalId,
          listingId: match.listingId,
        });
        await upsertChannelAdTargetDaily(prisma, {
          companyId,
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
        logger.debug(
          `ingestAdCampaign skipped target daily upsert: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    listingDailyCount += await flushListingAdMetrics(prisma, listingAdMetrics);

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
      await upsertChannelAccountKpi(prisma, {
        companyId,
        channel: 'coupang',
        source: 'advertising',
        kpiType: 'advertising_campaign_kpis',
        businessDate: today,
        periodStart: toBusinessDate(payload.dateFrom),
        periodEnd: toBusinessDate(payload.dateTo),
        normalizedJson: kpiRecord as unknown as Prisma.InputJsonValue,
        rawJson: kpiRecord as unknown as Prisma.InputJsonValue,
      });
      accountKpiCount += 1;
    }

    await finalizeScrapeRun(prisma, {
      scrapeRunId: scrapeRun.id,
      companyId,
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
    await finalizeScrapeRunOnError(prisma, {
      scrapeRunId: scrapeRun.id,
      companyId,
      rowCount: scrapeSnapshotCount,
      matchedCount: scrapeMatched,
      unmatchedCount: scrapeUnmatched,
      err,
    });
    throw err;
  }
}
