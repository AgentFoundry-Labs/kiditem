import { cleanString, toNumber, toNumberOrNull } from '../../domain/scrape-row-normalizers';
import {
  buildAdTargetKey,
  campaignIdFromCanonicalIdentity,
  canonicalCampaignIdentity,
} from '../../domain/util/ad-target-key';
import { normalizeAdKeywordOrigin, normalizeAdKeyword } from '../../domain/ad-keyword';
import type { ListingMap } from '../../domain/listing-match';
import type { UpsertAdTargetDailyInput } from '../port/out/repository/channel-target-daily.repository.port';

/** Existing keyword normalization shared by legacy characterization and fenced staging. */
export function normalizeAdKeywordTarget(
  row: Record<string, unknown>,
  context: {
    organizationId: string;
    map: ListingMap;
    businessDate: Date;
    windowDays: number;
    campaignName: string | null;
    rawSnapshotId?: string | null;
  },
): UpsertAdTargetDailyInput | null {
  const {
    organizationId,
    map,
    businessDate,
    windowDays,
    campaignName,
    rawSnapshotId = null,
  } = context;
  const keyword = normalizeAdKeyword(row.keyword);
  if (!keyword) return null;
  const externalOptionId = cleanString(row.externalOptionId);
  const match = externalOptionId ? (map.externalOptionIdMap.get(externalOptionId) ?? null) : null;
  const rowCampaignIdentity = canonicalCampaignIdentity({
    campaignId: cleanString(row.campaignId),
    campaignIdentity: cleanString(row.campaignIdentity),
  });
  const adGroup = cleanString(row.adGroup);
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
    rawSnapshotId,
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

  return input;
}

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

export function mergeKeywordTargets(
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
