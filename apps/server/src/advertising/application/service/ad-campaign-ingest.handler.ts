// `ad_campaign` payloads land in two places:
//   1. `ChannelScrapeRun` + `ChannelScrapeSnapshot` per row (raw audit/replay)
//   2. `ChannelAdTargetDailySnapshot` per row at the appropriate
//      campaign/keyword/product grain
//
// This handler deliberately does NOT project campaign rows into
// `ChannelListingDailySnapshot`: the extension sends one request per campaign,
// and a listing can participate in multiple campaigns on the same day. Without
// a complete sweep envelope, a listing-day upsert would make the last campaign
// overwrite the earlier campaigns instead of producing an exact sum.
//
// Campaign KPI widgets are intentionally kept only in the raw scrape run.
// The extension submits one request per campaign, while
// `ChannelAccountDailyKpiSnapshot` is unique per account/source/day/type.
// Projecting each request there would make the last campaign overwrite every
// earlier campaign. Exact account totals are written separately by the
// `coupang_ads_daily` ingest path.
//
// Provider ratios (ROAS/CTR/CVR) are NOT trusted: only the additive
// numerator/denominator columns are stored; provider ratios survive in
// `metaJson` for audit. Reads recompute ratios.

import { Inject, Injectable, Logger } from '@nestjs/common';
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
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
  type UpsertAdTargetDailyInput,
} from '../port/out/repository/channel-target-daily.repository.port';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';

@Injectable()
export class AdCampaignIngestHandler {
  private readonly logger = new Logger(AdCampaignIngestHandler.name);

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
    const campaignName = payload.campaignName || '_전체';
    const period = String(payload.period || '7d');
    const businessDate = resolveBusinessDate(
      payload.startDate,
      payload.dateFrom,
      payload.endDate,
      payload.dateTo,
      payload.timestamp,
    );
    const periodStart =
      toBusinessDate(payload.startDate) ?? toBusinessDate(payload.dateFrom);
    const periodEnd =
      toBusinessDate(payload.endDate) ?? toBusinessDate(payload.dateTo);
    const hasSingleDayRange = Boolean(
      periodStart &&
        periodEnd &&
        periodStart.getTime() === periodEnd.getTime(),
    );
    const isAuthoritativeCampaignDay =
      payload.campaignReportScope === 'single_campaign_authoritative';
    const projectsSingleDayFacts =
      hasSingleDayRange && isAuthoritativeCampaignDay;
    // A multi-campaign dashboard report is still dated raw evidence. It must
    // never replace one campaign's target set, but its snapshots retain the
    // requested day for audit/replay.
    const rawBusinessDate = hasSingleDayRange ? businessDate : null;
    const kpis = payload.kpis || {};
    const normalizedRows = payload.normalizedRows ?? [];
    const scrapeRows = pairScrapeRows(payload.data, normalizedRows);
    const campaignIds = new Set(
      normalizedRows
        .map((row) => cleanString(row?.campaignId))
        .filter((value): value is string => value !== null),
    );
    const campaignIdentities = new Set(
      normalizedRows
        .map((row) => cleanString(row?.campaignIdentity))
        .filter((value): value is string => value !== null),
    );
    const campaignScopeId =
      campaignIds.size === 1 ? [...campaignIds][0] : null;
    const campaignScopeIdentity =
      campaignIdentities.size === 1 ? [...campaignIdentities][0] : null;

    const scrapeRun = await this.scrapeRepo.createRun({
      organizationId,
      channelAccountId: map.channelAccountId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'campaign',
      businessDate: rawBusinessDate,
      periodStart,
      periodEnd,
      targetUrl: payload.url ?? null,
      period,
      metaJson: {
        campaignName,
        campaignReportScope: payload.campaignReportScope ?? 'legacy_raw_only',
        dashboardOnOff: payload.dashboardOnOff ?? null,
        dashboardStatus: payload.dashboardStatus ?? null,
        kpis,
        rowCount: scrapeRows.length,
        normalizedRowCount: normalizedRows.length,
        dailyProjectionSkipped: !projectsSingleDayFacts,
      },
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      if (isAuthoritativeCampaignDay && !hasSingleDayRange) {
        throw new Error(
          'ad_campaign authoritative projection requires one exact business date; raw evidence was preserved',
        );
      }
      const listingDailyCount = 0;
      let targetDailyCount = 0;
      const accountKpiCount = 0;
      const targetDailyInputs = new Map<string, UpsertAdTargetDailyInput>();
      let authoritativeProjectionInvalid =
        campaignIds.size > 1 ||
        campaignIdentities.size > 1 ||
        (projectsSingleDayFacts &&
          !campaignScopeId &&
          !campaignScopeIdentity);
      let hasAuthoritativeIdentityRow = false;

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
          businessDate: rawBusinessDate,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
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

        if (!pair.hasNormalizedRow) {
          if (projectsSingleDayFacts) authoritativeProjectionInvalid = true;
          continue;
        }
        if (!projectsSingleDayFacts) continue;
        if (row._kpiOnly) continue;
        if (!row.campaignName && !row.productName && !row.keyword) {
          authoritativeProjectionInvalid = true;
          continue;
        }

        const rowCampaignName = cleanString(row.campaignName) || campaignName;
        const rowCampaignId = cleanString(row.campaignId) || campaignScopeId;
        const rowCampaignIdentity =
          cleanString(row.campaignIdentity) ||
          (rowCampaignId ? `campaign:${rowCampaignId}` : campaignScopeIdentity);
        if (
          rowCampaignId &&
          rowCampaignIdentity?.startsWith('campaign:') &&
          rowCampaignIdentity !== `campaign:${rowCampaignId}`
        ) {
          authoritativeProjectionInvalid = true;
          continue;
        }
        const rowAdGroup = cleanString(row.adGroup);
        const rowKeyword = cleanString(row.keyword);
        const rowStatus = cleanString(row.status);
        const rowOnOff = cleanString(row.onOff);
        const rowPageType = cleanString(row.pageType) || 'campaign';
        if (
          !row._campaignOnly &&
          !hasCompleteObservedAdditiveMetrics(row)
        ) {
          authoritativeProjectionInvalid = true;
          continue;
        }

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

        // Target-day fact: prefer the most specific grain available on the row.
        const targetType = deriveAdTargetType(rowPageType, rowKeyword);
        try {
          const targetKey = buildAdTargetKey({
            targetType,
            campaignId: rowCampaignId,
            campaignIdentity: rowCampaignIdentity,
            campaignName: rowCampaignName,
            adGroup: rowAdGroup,
            keyword: rowKeyword,
            externalOptionId: externalOptionIdRaw ?? match.externalOptionId,
            externalId: externalIdRaw ?? match.externalId,
            listingId: match.listingId,
          });
          const targetInput: UpsertAdTargetDailyInput = {
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
            status: rowStatus,
            onOff: rowOnOff,
            currentBid: rowCurrentBid,
            dailyBudget: rowDailyBudget,
            rawSnapshotId: snapshot.id,
            metaJson: {
              source: 'advertising.campaign.target',
              data: {
                campaignIdentity: rowCampaignIdentity,
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
          };
          const previous = targetDailyInputs.get(targetKey);
          targetDailyInputs.set(
            targetKey,
            previous
              ? mergeAuthoritativeTargetInputs(previous, targetInput)
              : targetInput,
          );
          hasAuthoritativeIdentityRow = true;
        } catch (e) {
          // Non-buildable identity (e.g., neither campaignId nor campaignName
          // present) — raw snapshot is preserved above. Skip target daily so
          // we never land an `unknown:unknown` row.
          this.logger.debug(
            `ingestAdCampaign skipped target daily upsert: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          authoritativeProjectionInvalid = true;
        }
      }

      if (projectsSingleDayFacts) {
        if (
          authoritativeProjectionInvalid ||
          !hasAuthoritativeIdentityRow
        ) {
          throw new Error(
            'ad_campaign authoritative single-day report requires one stable campaign id/identity, complete observed metrics, and at least one normalized campaign row; prior daily targets were preserved',
          );
        }
        const replacement = await this.targetDailyRepo.replaceCampaignDay({
          organizationId,
          channel: 'coupang',
          businessDate,
          campaignId: campaignScopeId,
          campaignIdentity: campaignScopeIdentity,
          campaignName,
          targets: [...targetDailyInputs.values()],
        });
        targetDailyCount = replacement.upsertedCount;
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
        dailyProjectionSkipped: !projectsSingleDayFacts,
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

const REQUIRED_ADDITIVE_METRICS = [
  'adSpend',
  'adRevenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
] as const;

const METRIC_PROPERTY_ALIASES: Record<
  (typeof REQUIRED_ADDITIVE_METRICS)[number],
  readonly string[]
> = {
  adSpend: ['runningAdSpend', 'spend'],
  adRevenue: ['revenue'],
  impressions: ['impressions'],
  clicks: ['clicks'],
  conversions: ['conversions'],
  orders: ['orders'],
};

/**
 * The extension always emits numeric zeroes, even when a report column was
 * not present. `_observedMetrics` is therefore authoritative when supplied;
 * falling back to property presence is only for explicit server/test callers
 * that predate that evidence map.
 */
function hasCompleteObservedAdditiveMetrics(
  row: Record<string, unknown>,
): boolean {
  const observed = row._observedMetrics;
  if (observed && typeof observed === 'object' && !Array.isArray(observed)) {
    const evidence = observed as Record<string, unknown>;
    return REQUIRED_ADDITIVE_METRICS.every((key) => evidence[key] === true);
  }
  return REQUIRED_ADDITIVE_METRICS.every((key) =>
    METRIC_PROPERTY_ALIASES[key].some((property) =>
      Object.prototype.hasOwnProperty.call(row, property),
    ),
  );
}

const ADDITIVE_TARGET_METRICS = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
  'adSpend',
  'adRevenue',
] as const satisfies ReadonlyArray<keyof UpsertAdTargetDailyInput>;

const STABLE_TARGET_DESCRIPTORS = [
  'organizationId',
  'channel',
  'targetType',
  'targetKey',
  'campaignId',
  'campaignName',
  'listingId',
  'listingOptionId',
  'externalId',
  'externalOptionId',
] as const satisfies ReadonlyArray<keyof UpsertAdTargetDailyInput>;

const COLLAPSIBLE_TARGET_DESCRIPTORS = [
  'adGroup',
  'keyword',
  'placement',
  'status',
  'onOff',
  'currentBid',
  'dailyBudget',
] as const satisfies ReadonlyArray<keyof UpsertAdTargetDailyInput>;

/**
 * Coupang may render more than one row at the product grain (for example one
 * product under multiple placements). The fact table intentionally stores a
 * campaign/product daily grain, so duplicate keys are additive rather than
 * last-write-wins. Conflicting optional descriptors collapse to null; stable
 * identity conflicts fail the whole authoritative replacement.
 */
function mergeAuthoritativeTargetInputs(
  previous: UpsertAdTargetDailyInput,
  next: UpsertAdTargetDailyInput,
): UpsertAdTargetDailyInput {
  if (previous.businessDate.getTime() !== next.businessDate.getTime()) {
    throw new Error(
      `ad_campaign duplicate target '${next.targetKey}' crossed business dates`,
    );
  }
  for (const key of STABLE_TARGET_DESCRIPTORS) {
    const left = previous[key] ?? null;
    const right = next[key] ?? null;
    if (left !== null && right !== null && left !== right) {
      throw new Error(
        `ad_campaign duplicate target '${next.targetKey}' has conflicting ${String(key)}`,
      );
    }
  }

  const merged: UpsertAdTargetDailyInput = {
    ...previous,
    rawSnapshotId: next.rawSnapshotId ?? previous.rawSnapshotId,
    observedAt: next.observedAt ?? previous.observedAt,
  };
  for (const key of STABLE_TARGET_DESCRIPTORS) {
    (merged as unknown as Record<string, unknown>)[key] =
      next[key] ?? previous[key] ?? null;
  }
  const descriptorConflicts: string[] = [];
  for (const key of COLLAPSIBLE_TARGET_DESCRIPTORS) {
    const left = previous[key] ?? null;
    const right = next[key] ?? null;
    const value =
      left === null ? right : right === null || left === right ? left : null;
    if (left !== null && right !== null && left !== right) {
      descriptorConflicts.push(String(key));
    }
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  for (const key of ADDITIVE_TARGET_METRICS) {
    const left = Number(previous[key] ?? 0);
    const right = Number(next[key] ?? 0);
    (merged as unknown as Record<string, unknown>)[key] = left + right;
  }

  const previousMeta = namespacedMetaData(previous.metaJson);
  const nextMeta = namespacedMetaData(next.metaJson);
  const previousCount = Number(previousMeta?.data.collapsedRowCount ?? 1);
  merged.metaJson = {
    source: nextMeta?.source ?? previousMeta?.source ?? 'advertising.campaign.target',
    data: {
      ...(previousMeta?.data ?? {}),
      ...(nextMeta?.data ?? {}),
      collapsedRowCount:
        (Number.isFinite(previousCount) ? previousCount : 1) + 1,
      ...(descriptorConflicts.length > 0
        ? { descriptorConflicts: [...new Set(descriptorConflicts)] }
        : {}),
    },
  };
  return merged;
}

function namespacedMetaData(metaJson: UpsertAdTargetDailyInput['metaJson']):
  | { source: string; data: Record<string, unknown> }
  | null {
  if (!metaJson || typeof metaJson !== 'object') return null;
  return metaJson;
}
