// `ad_keyword` is the per-ad keyword table behind the Coupang ad centre
// "키워드 보기" modal. It is a different provider surface from the campaign
// report grid that `ad_campaign` reads:
//
//   POST /marketing/cmg-api/tableMetric  { tableType: 'keyword', creativeId }
//     -> { "<keyword>": { impressions, clicks, deliveredAdCost, ... } }
//   GET  /marketing/tetris-api/ad/keywords/{adId}
//     -> registered keywords with their audit status and bid
//
// A keyword present only in the metric table is smart-targeting inventory
// Coupang matched on its own; the advertiser never registered it. That
// distinction is the whole point of collecting this grain, so it is carried
// through to `metaJson.data.origin` rather than being flattened away.
//
// ⚠ THESE ARE WINDOW OBSERVATIONS, NOT ADDITIVE DAILY FACTS.
// A one-day `tableMetric` window returns an empty keyword table — verified
// live on 2026-07-31, including against an ad with 17,058 impressions that
// day. Coupang only breaks keywords out over a multi-day range, so the
// collector asks for a trailing window (7 days by default) and a row means
// "as of `businessDate`, this keyword was attached to this ad and drew these
// metrics over the trailing `windowDays` days".
//
// Two consequences the read side depends on:
//   - `businessDate` is the window END and `metaJson.data.windowDays` records
//     its width. Summing two collections would double-count their overlap, so
//     `findKeywordTargetRollups` takes the latest observation per keyword
//     rather than a SUM.
//   - Rows land in `ChannelAdTargetDailySnapshot` with `targetType='keyword'`
//     and replace only the keyword grain for the campaign/day — the campaign
//     sweep owns campaign/product grain for the same campaign/day and the two
//     producers must not mark each other's rows stale.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import {
  resolveBusinessDate,
  toBusinessDate,
} from '../../domain/business-date';
import type { ListingMap } from '../../domain/listing-match';
import {
  asScrapeRow,
  cleanString,
  toNumber,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
import {
  buildAdTargetKey,
  campaignIdFromCanonicalIdentity,
  canonicalCampaignIdentity,
} from '../../domain/util/ad-target-key';
import {
  normalizeAdKeywordOrigin,
  normalizeAdKeyword,
} from '../../domain/ad-keyword';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
  type UpsertAdTargetDailyInput,
} from '../port/out/repository/channel-target-daily.repository.port';

@Injectable()
export class AdKeywordIngestHandler {
  private readonly logger = new Logger(AdKeywordIngestHandler.name);

  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    @Inject(CHANNEL_TARGET_DAILY_REPOSITORY_PORT)
    private readonly targetDailyRepo: ChannelTargetDailyRepositoryPort,
  ) {}

  async execute(
    payload: ExtensionSyncDto,
    organizationId: string,
    map: ListingMap,
  ) {
    const rows = (payload.data ?? []).map((row) => asScrapeRow(row));
    // The observation is dated to the END of its window: it describes the
    // keyword's state as of that day, looking back. Preferring `startDate`
    // here (the campaign-report convention) would date a 7-day reading to a
    // week earlier.
    const businessDate = resolveBusinessDate(
      payload.endDate,
      payload.dateTo,
      payload.startDate,
      payload.dateFrom,
      payload.timestamp,
    );
    const periodStart =
      toBusinessDate(payload.startDate) ?? toBusinessDate(payload.dateFrom);
    const periodEnd =
      toBusinessDate(payload.endDate) ?? toBusinessDate(payload.dateTo);
    // The observation window must be explicit and bounded. Without both ends
    // there is no way to say what the metrics cover, and an unbounded range
    // would let an arbitrary span masquerade as a current-state reading.
    const windowDays =
      periodStart && periodEnd
        ? Math.round(
            (periodEnd.getTime() - periodStart.getTime()) / 86_400_000,
          ) + 1
        : null;
    const hasUsableWindow =
      windowDays !== null &&
      windowDays >= MIN_KEYWORD_WINDOW_DAYS &&
      windowDays <= MAX_KEYWORD_WINDOW_DAYS;

    const campaignName = cleanString(payload.campaignName);
    const campaignIdentities = new Set(
      rows
        .map((row) =>
          canonicalCampaignIdentity({
            campaignId: cleanString(row.campaignId),
            campaignIdentity: cleanString(row.campaignIdentity),
          }),
        )
        .filter((value): value is string => value !== null),
    );
    const campaignIdentity =
      campaignIdentities.size === 1 ? [...campaignIdentities][0] : null;
    const campaignId = campaignIdFromCanonicalIdentity(campaignIdentity);

    const baseMeta = {
      campaignName: campaignName ?? null,
      campaignIdentity,
      adGroup: cleanString(payload.pageType) === null ? null : null,
      collectionRunId: payload.collectionRunId ?? null,
      collectionAttempt: payload.collectionAttempt ?? null,
      rowCount: rows.length,
      windowDays,
      hasUsableWindow,
    };

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channelAccountId: map.channelAccountId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'keyword',
      businessDate: hasUsableWindow ? businessDate : null,
      periodStart,
      periodEnd,
      targetUrl: payload.url ?? null,
      period: windowDays ? `${windowDays}d` : String(payload.period ?? ''),
      metaJson: baseMeta,
    });

    let snapshotCount = 0;
    let matchedCount = 0;
    try {
      const targets = new Map<string, UpsertAdTargetDailyInput>();
      let skippedCount = 0;

      for (const row of rows) {
        const keyword = normalizeAdKeyword(row.keyword);
        const externalOptionId = cleanString(row.externalOptionId);
        const match = externalOptionId
          ? map.externalOptionIdMap.get(externalOptionId) ?? null
          : null;

        const snapshot = await this.scrapeRepo.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          organizationId,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'keyword',
          businessDate: hasUsableWindow ? businessDate : null,
          externalId: null,
          externalOptionId,
          listingId: match?.listingId ?? null,
          listingOptionId: match?.listingOptionId ?? null,
          matchStatus: match ? 'matched' : 'unmatched',
          matchReason: match
            ? 'vendorItemId matched to listing option'
            : keyword
              ? 'keyword row without listing option identity'
              : 'unusable keyword value — snapshot only',
          rawJson: row,
        });
        snapshotCount += 1;
        if (match) matchedCount += 1;

        if (!keyword || !hasUsableWindow) {
          skippedCount += 1;
          continue;
        }

        const rowCampaignIdentity = canonicalCampaignIdentity({
          campaignId: cleanString(row.campaignId),
          campaignIdentity: cleanString(row.campaignIdentity),
        });
        const adGroup = cleanString(row.adGroup);
        try {
          const targetKey = buildAdTargetKey({
            channelAccountId: map.channelAccountId,
            targetType: 'keyword',
            campaignIdentity: rowCampaignIdentity,
            adGroup,
            keyword,
          });
          const spend = Math.round(toNumber(row.spend));
          const revenue = Math.round(toNumber(row.revenue));
          const input: UpsertAdTargetDailyInput = {
            organizationId,
            channelAccountId: map.channelAccountId,
            channel: 'coupang',
            businessDate,
            targetType: 'keyword',
            targetKey,
            listingId: match?.listingId ?? null,
            listingOptionId: match?.listingOptionId ?? null,
            externalId: null,
            externalOptionId,
            campaignId: campaignIdFromCanonicalIdentity(rowCampaignIdentity),
            campaignIdentity: rowCampaignIdentity,
            campaignName: cleanString(row.campaignName) ?? campaignName,
            adGroup,
            keyword,
            status: cleanString(row.status),
            onOff: cleanString(row.onOff),
            currentBid: toNumberOrNull(row.currentBid),
            rawSnapshotId: snapshot.id,
            metaJson: {
              source: 'advertising.keyword.target',
              data: {
                origin: normalizeAdKeywordOrigin(row.origin),
                // Width of the observation window these metrics cover. The
                // read side needs it to avoid treating them as one day.
                windowDays,
                adId: cleanString(row.adId),
                productName: cleanString(row.productName),
                keywordType: cleanString(row.keywordType),
                bidSource: cleanString(row.bidSource),
              },
            },
            spend,
            revenue,
            impressions: Math.round(toNumber(row.impressions)),
            clicks: Math.round(toNumber(row.clicks)),
            conversions: Math.round(toNumber(row.conversions)),
            orders: Math.round(toNumber(row.orders)),
            adSpend: spend,
            adRevenue: revenue,
          };
          // The same keyword can be served for several ads in one ad group.
          // The fact table is keyed by campaign/adGroup/keyword, so those
          // shares are summed rather than racing each other on write.
          const previous = targets.get(targetKey);
          targets.set(
            targetKey,
            previous ? mergeKeywordTargets(previous, input) : input,
          );
        } catch (err) {
          // No stable campaign identity — raw snapshot above still preserves
          // the row. Never land an unidentifiable daily fact.
          skippedCount += 1;
          this.logger.debug(
            `ingestAdKeyword skipped target daily upsert: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      let targetDailyCount = 0;
      let deletedTargetDailyCount = 0;
      let projectionRejectionCode: string | null = null;

      if (targets.size > 0 && campaignIdentity) {
        const replacement = await this.targetDailyRepo.replaceCampaignDay({
          organizationId,
          channelAccountId: map.channelAccountId,
          channel: 'coupang',
          businessDate,
          campaignId,
          campaignIdentity,
          campaignName: campaignName ?? '_전체',
          targets: [...targets.values()],
          // Keyword grain only. The campaign sweep owns campaign/product rows
          // for this same campaign and day.
          replaceScope: ['keyword'],
        });
        if (replacement.kind === 'rejected') {
          projectionRejectionCode = replacement.code;
        } else {
          targetDailyCount = replacement.upsertedCount;
          deletedTargetDailyCount = replacement.deletedCount;
        }
      } else if (targets.size > 0) {
        projectionRejectionCode = 'missing_stable_campaign_identity';
      }

      if (projectionRejectionCode) {
        await this.scrapeRepo.updateRunMeta({
          scrapeRunId: scrapeRun.id,
          organizationId,
          metaJson: { ...baseMeta, projectionRejectionCode },
        });
      }

      await this.scrapeRepo.finalizeRun({
        scrapeRunId: scrapeRun.id,
        organizationId,
        status: 'complete',
        rowCount: snapshotCount,
        matchedCount,
        unmatchedCount: snapshotCount - matchedCount,
      });

      return {
        success: true,
        type: 'ad_keyword',
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount: snapshotCount,
        scrapeMatchedCount: matchedCount,
        scrapeUnmatchedCount: snapshotCount - matchedCount,
        keywordCount: targetDailyCount,
        deletedKeywordCount: deletedTargetDailyCount,
        skippedCount,
        ...(projectionRejectionCode ? { projectionRejectionCode } : {}),
      };
    } catch (err) {
      await this.scrapeRepo.finalizeRunOnError({
        scrapeRunId: scrapeRun.id,
        organizationId,
        rowCount: snapshotCount,
        matchedCount,
        unmatchedCount: snapshotCount - matchedCount,
        err,
      });
      throw err;
    }
  }
}

/**
 * Bounds on the observation window. Below 2 days the provider returns nothing;
 * above 31 the reading is too stale to describe current state.
 */
const MIN_KEYWORD_WINDOW_DAYS = 2;
const MAX_KEYWORD_WINDOW_DAYS = 31;

const KEYWORD_ADDITIVE_METRICS = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
  'adSpend',
  'adRevenue',
] as const satisfies readonly (keyof UpsertAdTargetDailyInput)[];

function mergeKeywordTargets(
  previous: UpsertAdTargetDailyInput,
  next: UpsertAdTargetDailyInput,
): UpsertAdTargetDailyInput {
  const merged: UpsertAdTargetDailyInput = { ...previous };
  for (const metric of KEYWORD_ADDITIVE_METRICS) {
    merged[metric] = (previous[metric] ?? 0) + (next[metric] ?? 0);
  }
  // Descriptors only fill gaps: the first row with a value wins so a later
  // share cannot blank out an identity the earlier one established.
  merged.status = previous.status ?? next.status;
  merged.onOff = previous.onOff ?? next.onOff;
  merged.currentBid = previous.currentBid ?? next.currentBid;
  merged.campaignName = previous.campaignName ?? next.campaignName;
  // A keyword shared by several ads is no longer attributable to one option.
  if (previous.externalOptionId !== next.externalOptionId) {
    merged.externalOptionId = null;
    merged.listingId = null;
    merged.listingOptionId = null;
  }
  return merged;
}
