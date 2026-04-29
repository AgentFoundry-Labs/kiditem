// apps/server/src/advertising/util/ad-target-key.ts
//
// Deterministic canonical key builder for
// `ChannelAdTargetDailySnapshot.targetKey`.
//
// The daily-fact table is uniquely keyed by
//   (companyId, channel, businessDate, targetType, targetKey)
// so `targetKey` MUST be non-null and stable across replays.
//
// Patterns (single source of truth):
//   campaign:<campaignId || campaignName>
//   keyword:<campaignId || campaignName>:<adGroup>:<keyword>
//   product:<externalId || listingId>:<campaignId || campaignName>
//
// Throws when no usable identifier is present so we never store
// `unknown:unknown` rows. Two distinct payloads with different identifiers
// produce different keys; two identical payloads produce identical keys.
//
// 2026-04-27 — ad-product variant removed. It had a full type/branch but
// no production producer (`deriveTargetType` never returned it; the
// `coupang_ads_daily` payload lands in account KPI, not target daily).
// Re-add when a producer is wired (YAGNI).

export type AdTargetType = 'campaign' | 'keyword' | 'product';

interface BuildAdTargetKeyInput {
  targetType: AdTargetType;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroup?: string | null;
  keyword?: string | null;
  externalId?: string | null;
  listingId?: string | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a deterministic non-null canonical key for
 * `ChannelAdTargetDailySnapshot.targetKey`.
 *
 * Throws if no usable identifier is present (no "unknown:unknown" rows).
 *
 * `adGroup` and `keyword` segments fall back to `''` (empty segment) when
 * absent so the colon-delimited shape is preserved; this means a keyword
 * row with no `adGroup` still produces a stable key, but a row with no
 * `keyword` AND no campaign identity is rejected.
 */
export function buildAdTargetKey(input: BuildAdTargetKeyInput): string {
  const campaignId = trimOrNull(input.campaignId);
  const campaignName = trimOrNull(input.campaignName);
  const adGroup = trimOrNull(input.adGroup);
  const keyword = trimOrNull(input.keyword);
  const externalId = trimOrNull(input.externalId);
  const listingId = trimOrNull(input.listingId);
  const campaignAnchor = campaignId ?? campaignName;
  const productAnchor = externalId ?? listingId;

  switch (input.targetType) {
    case 'campaign': {
      if (!campaignAnchor) {
        throw new Error(
          'buildAdTargetKey: campaign target requires campaignId or campaignName',
        );
      }
      return `campaign:${campaignAnchor}`;
    }
    case 'keyword': {
      if (!campaignAnchor || !keyword) {
        throw new Error(
          'buildAdTargetKey: keyword target requires (campaignId|campaignName) and keyword',
        );
      }
      return `keyword:${campaignAnchor}:${adGroup ?? ''}:${keyword}`;
    }
    case 'product': {
      if (!productAnchor || !campaignAnchor) {
        throw new Error(
          'buildAdTargetKey: product target requires (externalId|listingId) and (campaignId|campaignName)',
        );
      }
      return `product:${productAnchor}:${campaignAnchor}`;
    }
    default: {
      // Defensive — TS already narrows targetType, but raw payloads may slip in.
      throw new Error(
        `buildAdTargetKey: unsupported targetType '${String(
          (input as { targetType?: string }).targetType,
        )}'`,
      );
    }
  }
}
