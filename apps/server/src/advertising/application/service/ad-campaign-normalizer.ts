import { resolveAdTargetGrain } from '../../domain/ad-target-grain';
import { hasObservedConversionColumn } from '../../domain/ad-observed-columns';
import { matchListingFromRow, pickStringField, type ListingMap } from '../../domain/listing-match';
import {
  cleanString,
  deriveAdTargetType,
  toNumber,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
import {
  buildAdTargetKey,
  campaignIdFromCanonicalIdentity,
  canonicalCampaignIdentity,
} from '../../domain/util/ad-target-key';
import type { UpsertAdTargetDailyInput } from '../port/out/repository/channel-target-daily.repository.port';

export function normalizeAdCampaignTarget(
  row: Record<string, unknown>,
  payload: { dashboardOnOff?: string | null },
  {
    organizationId,
    map,
    businessDate,
    campaignName,
    campaignScopeId,
    stableCampaignScopeIdentity,
    snapshotId,
  }: {
    organizationId: string;
    map: ListingMap;
    businessDate: Date;
    campaignName: string;
    campaignScopeId: string | null;
    stableCampaignScopeIdentity: string | null;
    snapshotId: string;
  },
): UpsertAdTargetDailyInput {
  const match = matchListingFromRow(row, map);
  const externalIdRaw = pickStringField(row, [
    'externalId',
    'external_id',
    'productId',
    'coupangProductId',
  ]);
  const externalOptionIdRaw = pickStringField(row, ['vendorItemId', 'vendor_item_id', 'itemId']);
  const rowCampaignName = cleanString(row.campaignName) || campaignName;
  const rowCampaignIdentity = canonicalCampaignIdentity({
    campaignId: cleanString(row.campaignId) || campaignScopeId,
    campaignIdentity: cleanString(row.campaignIdentity) || stableCampaignScopeIdentity,
  });
  const rowCampaignId = campaignIdFromCanonicalIdentity(rowCampaignIdentity);
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

  // Target-day fact: prefer the most specific grain available on the row.
  const targetType =
    row._campaignOnly === true ? 'campaign' : deriveAdTargetType(rowPageType, rowKeyword);
  const targetKey = buildAdTargetKey({
    channelAccountId: map.channelAccountId,
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
    channelAccountId: map.channelAccountId,
    channel: 'coupang',
    businessDate,
    targetType,
    targetKey,
    listingId: match.listingId ?? null,
    listingOptionId: match.listingOptionId ?? null,
    externalId: externalIdRaw ?? match.externalId ?? null,
    externalOptionId: externalOptionIdRaw ?? match.externalOptionId ?? null,
    campaignId: rowCampaignId,
    campaignIdentity: rowCampaignIdentity,
    campaignName: rowCampaignName,
    adGroup: rowAdGroup,
    keyword: rowKeyword,
    placement: cleanString(row.placement),
    status: rowStatus,
    onOff: rowOnOff ?? cleanString(payload.dashboardOnOff),
    currentBid: rowCurrentBid,
    dailyBudget: rowDailyBudget,
    rawSnapshotId: snapshotId,
    metaJson: {
      source: 'advertising.campaign.target',
      data: {
        // Explicit grain stamp: a campaign rollup row already contains
        // every member product's metrics, so product-grain reads must
        // exclude it or the campaign is counted twice.
        granularity: resolveAdTargetGrain({
          externalOptionId: externalOptionIdRaw ?? match.externalOptionId,
          listingOptionId: match.listingOptionId,
          listingId: match.listingId,
        }),
        campaignIdentity: rowCampaignIdentity,
        // Whether the scraped grid actually had a conversion-count
        // column. The Coupang campaign dashboard grid has none — only
        // the per-campaign product detail grid carries
        // `광고 전환 판매수`. The extension still emits a numeric zero
        // for absent columns, so without this stamp a campaign-grain
        // `conversions = 0` is indistinguishable from a real zero and
        // the UI shows a fabricated 0 conversions on rows with real
        // revenue.
        conversionsObserved: hasObservedConversionColumn(row),
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

  return targetInput;
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
export function hasCompleteObservedAdditiveMetrics(row: Record<string, unknown>): boolean {
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
  'campaignIdentity',
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
export function mergeAuthoritativeTargetInputs(
  previous: UpsertAdTargetDailyInput,
  next: UpsertAdTargetDailyInput,
): UpsertAdTargetDailyInput {
  if (previous.businessDate.getTime() !== next.businessDate.getTime()) {
    throw new Error(`ad_campaign duplicate target '${next.targetKey}' crossed business dates`);
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
    (merged as unknown as Record<string, unknown>)[key] = next[key] ?? previous[key] ?? null;
  }
  const descriptorConflicts: string[] = [];
  for (const key of COLLAPSIBLE_TARGET_DESCRIPTORS) {
    const left = previous[key] ?? null;
    const right = next[key] ?? null;
    const value = left === null ? right : right === null || left === right ? left : null;
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
      collapsedRowCount: (Number.isFinite(previousCount) ? previousCount : 1) + 1,
      ...(descriptorConflicts.length > 0
        ? { descriptorConflicts: [...new Set(descriptorConflicts)] }
        : {}),
    },
  };
  return merged;
}

function namespacedMetaData(
  metaJson: UpsertAdTargetDailyInput['metaJson'],
): { source: string; data: Record<string, unknown> } | null {
  if (!metaJson || typeof metaJson !== 'object') return null;
  return metaJson;
}
