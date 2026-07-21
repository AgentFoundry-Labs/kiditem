// apps/server/src/advertising/util/ad-target-key.ts
//
// Deterministic canonical key builder for
// `ChannelAdTargetDailySnapshot.targetKey`.
//
// The daily-fact table is uniquely keyed by
//   (organizationId, channelAccountId, channel, businessDate, targetType, targetKey)
// so `targetKey` MUST be non-null and stable across replays.
//
// Patterns (single source of truth):
//   account:<channelAccountId>:campaign:<canonical-provider-id>
//   account:<channelAccountId>:keyword:<campaign-anchor>:<adGroup>:<keyword>
//   account:<channelAccountId>:product:<campaign-anchor>:<product-anchor>
//   account:<channelAccountId>:product:<product-anchor> (explicit campaign-less)
//
// Throws when no usable identifier is present so we never store
// `unknown:unknown` rows. Two distinct payloads with different identifiers
// produce different keys; two identical payloads produce identical keys.
//
export type AdTargetType = 'campaign' | 'keyword' | 'product';

interface BuildAdTargetKeyInput {
  channelAccountId: string;
  targetType: AdTargetType;
  campaignId?: string | null;
  campaignIdentity?: string | null;
  /** Display-only evidence. Deliberately ignored for identity construction. */
  campaignName?: string | null;
  /** Explicit evidence that this product row did not originate in a campaign. */
  campaignless?: boolean;
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

export function normalizeStableCampaignIdentity(
  value: string | null | undefined,
): string | null {
  const normalized = trimOrNull(value);
  if (!normalized) return null;
  if (normalized.startsWith('campaign:')) {
    const campaignId = normalizeCampaignProviderId(
      normalized.slice('campaign:'.length),
    );
    return campaignId ? `campaign:${campaignId}` : null;
  }
  if (!normalized.startsWith('href:')) return null;
  try {
    const url = new URL(normalized.slice('href:'.length));
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'advertising.coupang.com' ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      return null;
    }

    // Only a campaign-specific route can provide identity evidence. Dashboard
    // list URLs (including hashes that merely mention a campaign) remain raw.
    const segments = url.pathname.split('/').filter(Boolean);
    const campaignIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === 'campaign',
    );
    if (campaignIndex < 0) return null;

    const pathCampaignId = normalizeCampaignProviderId(
      segments[campaignIndex + 1],
    );
    const queryCampaignIds = [...url.searchParams.entries()]
      .filter(([key]) =>
        ['campaignid', 'campaignno', 'campaign_id'].includes(key.toLowerCase()),
      )
      .map(([, entryValue]) => normalizeCampaignProviderId(entryValue))
      .filter((entryValue): entryValue is string => entryValue !== null);
    const uniqueQueryIds = new Set(queryCampaignIds);
    if (uniqueQueryIds.size > 1) return null;
    const queryCampaignId = [...uniqueQueryIds][0] ?? null;
    if (
      pathCampaignId &&
      queryCampaignId &&
      pathCampaignId !== queryCampaignId
    ) {
      return null;
    }
    const campaignId = queryCampaignId ?? pathCampaignId;
    return campaignId ? `campaign:${campaignId}` : null;
  } catch {
    return null;
  }
}

function normalizeCampaignProviderId(
  value: string | null | undefined,
): string | null {
  const normalized = trimOrNull(value);
  if (!normalized) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(normalized).trim();
  } catch {
    return null;
  }
  if (
    decoded.length === 0 ||
    /^(?:type|registration|create|new|product|detail|dashboard|sales)$/i.test(
      decoded,
    )
  ) {
    return null;
  }
  return decoded;
}

export function canonicalCampaignIdentity(input: {
  campaignId?: string | null;
  campaignIdentity?: string | null;
}): string | null {
  const campaignId = normalizeCampaignProviderId(input.campaignId);
  const fromId = campaignId ? `campaign:${campaignId}` : null;
  const fromIdentity = normalizeStableCampaignIdentity(input.campaignIdentity);
  if (fromId && fromIdentity && fromId !== fromIdentity) return null;
  return fromId ?? fromIdentity;
}

export function campaignIdFromCanonicalIdentity(
  campaignIdentity: string | null | undefined,
): string | null {
  const canonical = normalizeStableCampaignIdentity(campaignIdentity);
  return canonical?.startsWith('campaign:')
    ? canonical.slice('campaign:'.length)
    : null;
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
  const channelAccountId = trimOrNull(input.channelAccountId);
  if (!channelAccountId) {
    throw new Error('buildAdTargetKey: channelAccountId is required');
  }
  const campaignIdentity = canonicalCampaignIdentity(input);
  const adGroup = trimOrNull(input.adGroup);
  const keyword = trimOrNull(input.keyword);
  const externalOptionId = trimOrNull(input.externalOptionId);
  const externalId = trimOrNull(input.externalId);
  const listingId = trimOrNull(input.listingId);
  const campaignAnchor = campaignIdFromCanonicalIdentity(campaignIdentity);
  const hasCampaignEvidence = Boolean(
    trimOrNull(input.campaignId) ||
      trimOrNull(input.campaignIdentity) ||
      trimOrNull(input.campaignName) ||
      adGroup ||
      keyword,
  );
  const productAnchor = externalOptionId ?? externalId ?? listingId;
  const prefix = `account:${channelAccountId}`;

  switch (input.targetType) {
    case 'campaign': {
      if (!campaignAnchor) {
        throw new Error(
          'buildAdTargetKey: campaign target requires a stable campaign identity',
        );
      }
      return `${prefix}:campaign:${campaignAnchor}`;
    }
    case 'keyword': {
      if (!campaignAnchor || !keyword) {
        throw new Error(
          'buildAdTargetKey: keyword target requires a stable campaign identity and keyword',
        );
      }
      return `${prefix}:keyword:${campaignAnchor}:${adGroup ?? ''}:${keyword}`;
    }
    case 'product': {
      if (!productAnchor) {
        throw new Error(
          'buildAdTargetKey: product target requires externalOptionId, externalId, or listingId',
        );
      }
      if (!campaignAnchor && hasCampaignEvidence) {
        throw new Error(
          'buildAdTargetKey: product campaign evidence requires a stable campaign identity',
        );
      }
      if (!campaignAnchor && input.campaignless !== true) {
        throw new Error(
          'buildAdTargetKey: product without campaign identity requires campaignless=true',
        );
      }
      if (campaignAnchor && input.campaignless === true) {
        throw new Error(
          'buildAdTargetKey: campaignless product cannot carry campaign identity',
        );
      }
      // A product can participate in several campaigns on the same date, so
      // the campaign identity remains part of the key whenever available.
      return campaignAnchor
        ? `${prefix}:product:${campaignAnchor}:${productAnchor}`
        : `${prefix}:product:${productAnchor}`;
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
