// `raw_scrape` covers both wing item-winner rows and advertising dashboard
// rows. Each row creates a `ChannelScrapeSnapshot` first; matched rows
// then upsert listing/option daily state (winner state) for wing, and
// listing-day ad metrics + target-day fact for advertising. Wing
// dashboard KPI cards land in `ChannelAccountDailyKpiSnapshot`.
//
// Unknown sources still snapshot every row (raw preservation principle)
// without any daily-fact upsert.

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
  normalizeWingListingState,
  normalizeWingOptionState,
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
import {
  upsertChannelAdTargetDaily,
  upsertChannelListingDaily,
  upsertChannelOptionDaily,
} from '../../adapter/out/prisma/channel-daily-fact.persistence';
import { upsertChannelAccountKpi } from '../../adapter/out/prisma/channel-account-kpi.persistence';
import {
  addListingAdMetrics,
  flushListingAdMetrics,
  type ListingAdMetricAccumulator,
} from './listing-ad-metric-accumulator';

const logger = new Logger('RawScrapeIngest');

export interface RawScrapeIngestDeps {
  prisma: PrismaService;
}

export async function ingestRawScrape(
  payload: ExtensionSyncDto,
  organizationId: string,
  map: ListingMap,
  deps: RawScrapeIngestDeps,
) {
  const { prisma } = deps;
  const source = payload.source || 'unknown';
  const rows = payload.data ?? [];
  const normalizedRowsAll = payload.normalizedRows ?? [];

  const businessDate = resolveBusinessDate(
    payload.timestamp,
    payload.startDate,
    payload.dateFrom,
    payload.dateTo,
  );
  const scrapeRun = await createScrapeRun(prisma, {
    organizationId,
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
    } as unknown as Prisma.InputJsonValue,
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
        const snapshot = await appendScrapeSnapshot(prisma, {
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
          optionId: match.optionId,
          matchStatus,
          matchReason:
            !productName || productName.length < 3
              ? 'short-product-name (snapshot only)'
              : null,
          rawJson: row as unknown as Prisma.InputJsonValue,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        // Daily fact upsert for matched rows. Winner state is valuable
        // even when productName is short (no legacy filter applied).
        if (match.listingId && businessDate) {
          const listingState = normalizeWingListingState(row);
          if (listingState) {
            await upsertChannelListingDaily(prisma, {
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
              await upsertChannelOptionDaily(prisma, {
                organizationId,
                listingId: match.listingId,
                listingOptionId: match.listingOptionId,
                optionId: match.optionId,
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
        await upsertChannelAccountKpi(prisma, {
          organizationId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_itemwinner_kpi',
          businessDate,
          normalizedJson: {
            kpis,
            rowCount: rows.length,
            timestamp: payload.timestamp,
          } as unknown as Prisma.InputJsonValue,
          rawJson: {
            kpis,
            rowCount: rows.length,
            timestamp: payload.timestamp,
          } as unknown as Prisma.InputJsonValue,
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
        const snapshot = await appendScrapeSnapshot(prisma, {
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
          optionId: match.optionId,
          matchStatus,
          matchReason: pair.hasNormalizedRow
            ? null
            : 'missing normalized row (snapshot only)',
          rawJson: pair.rawRow as unknown as Prisma.InputJsonValue,
          normalizedJson: pair.hasNormalizedRow
            ? (row as unknown as Prisma.InputJsonValue)
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
          await upsertChannelAdTargetDaily(prisma, {
            organizationId,
            channel: 'coupang',
            businessDate,
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
          logger.debug(
            `ingestRawScrape advertising skipped target daily upsert: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    }

    listingDailyCount += await flushListingAdMetrics(prisma, listingAdMetrics);

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
        await appendScrapeSnapshot(prisma, {
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
          optionId: match.optionId,
          matchStatus,
          matchReason: `unknown source '${source}' — raw preserved`,
          rawJson: row as unknown as Prisma.InputJsonValue,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;
      }
    }

    await finalizeScrapeRun(prisma, {
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
    await finalizeScrapeRunOnError(prisma, {
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
