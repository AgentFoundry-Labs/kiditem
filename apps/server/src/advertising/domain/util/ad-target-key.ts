// apps/server/src/advertising/util/ad-target-key.ts
//
// Deterministic canonical key builder for
// `ChannelAdTargetDailySnapshot.targetKey`.
//
// The daily-fact table is uniquely keyed by
//   (organizationId, channel, businessDate, targetType, targetKey)
// so `targetKey` MUST be non-null and stable across replays.
//
// Patterns (single source of truth):
//   campaign:<campaignId || campaignIdentity || campaignName>
//   keyword:<campaignId || campaignIdentity || campaignName>:<adGroup>:<keyword>
//   product:<campaignId || campaignIdentity || campaignName>:<externalOptionId || externalId || listingId>
//   product:<externalOptionId || externalId || listingId> (campaign-less fallback)
//
// Throws when no usable identifier is present so we never store
// `unknown:unknown` rows. Two distinct payloads with different identifiers
// produce different keys; two identical payloads produce identical keys.
//
export type AdTargetType = 'campaign' | 'keyword' | 'product';

interface BuildAdTargetKeyInput {
  targetType: AdTargetType;
  campaignId?: string | null;
  campaignIdentity?: string | null;
  campaignName?: string | null;
  adGroup?: string | null;
  keyword?: string | null;
  externalOptionId?: string | null;
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
  const campaignIdentity = trimOrNull(input.campaignIdentity);
  const campaignName = trimOrNull(input.campaignName);
  const adGroup = trimOrNull(input.adGroup);
  const keyword = trimOrNull(input.keyword);
  const externalOptionId = trimOrNull(input.externalOptionId);
  const externalId = trimOrNull(input.externalId);
  const listingId = trimOrNull(input.listingId);
  const campaignAnchor = campaignId ?? campaignIdentity ?? campaignName;
  const productAnchor = externalOptionId ?? externalId ?? listingId;

  switch (input.targetType) {
    case 'campaign': {
      if (!campaignAnchor) {
        throw new Error(
          'buildAdTargetKey: campaign target requires campaignId, campaignIdentity, or campaignName',
        );
      }
      return `campaign:${campaignAnchor}`;
    }
    case 'keyword': {
      if (!campaignAnchor || !keyword) {
        throw new Error(
          'buildAdTargetKey: keyword target requires (campaignId|campaignIdentity|campaignName) and keyword',
        );
      }
      return `keyword:${campaignAnchor}:${adGroup ?? ''}:${keyword}`;
    }
    case 'product': {
      if (!productAnchor) {
        throw new Error(
          'buildAdTargetKey: product target requires externalOptionId, externalId, or listingId',
        );
      }
      // Coupang's campaign sweep sends one request per campaign. A product can
      // participate in several campaigns on the same business date, so the
      // campaign identity must be part of the daily-fact key whenever it is
      // available. Sources that genuinely have no campaign identity retain the
      // original stable product-only key.
      return campaignAnchor
        ? `product:${campaignAnchor}:${productAnchor}`
        : `product:${productAnchor}`;
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
