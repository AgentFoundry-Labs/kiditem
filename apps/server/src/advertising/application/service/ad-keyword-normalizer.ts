import { cleanString, readProviderMetric, toNumberOrNull } from '../../domain/scrape-row-normalizers';
import {
  buildAdTargetKey,
  campaignIdFromCanonicalIdentity,
  canonicalCampaignIdentity,
} from '../../domain/util/ad-target-key';
import { normalizeAdKeywordOrigin, normalizeAdKeyword } from '../../domain/ad-keyword';
import type { ListingMap } from '../../domain/listing-match';
import type { UpsertAdTargetDailyInput } from '../port/out/repository/channel-target-daily.repository.port';

const KEYWORD_OBSERVED_METRICS = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
] as const;

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
  // The keyword table is untyped provider JSON. A present cell must parse; an
  // absent one is stored as 0 and stamped unobserved in `observedMetrics`.
  const observedMetrics = Object.fromEntries(
    KEYWORD_OBSERVED_METRICS.map((key) => [key, Object.prototype.hasOwnProperty.call(row, key)]),
  ) as Record<(typeof KEYWORD_OBSERVED_METRICS)[number], boolean>;
  const metric = (key: (typeof KEYWORD_OBSERVED_METRICS)[number]) =>
    readProviderMetric(row[key], observedMetrics[key], key);
  const spend = metric('spend');
  const revenue = metric('revenue');
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
        observedMetrics,
      },
    },
    spend,
    revenue,
    impressions: metric('impressions'),
    clicks: metric('clicks'),
    conversions: metric('conversions'),
    orders: metric('orders'),
    adSpend: spend,
    adRevenue: revenue,
  };

  return input;
}
