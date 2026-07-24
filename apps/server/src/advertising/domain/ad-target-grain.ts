// Grain (granularity) resolution for `ChannelAdTargetDailySnapshot` rows.
//
// WHY THIS EXISTS
// ---------------
// The Coupang advertising report renders two different layers in the same
// grid, and both historically landed in the fact table with
// `target_type = 'product'`:
//
//   1. Campaign rollup rows  — one row per campaign, already the SUM of every
//      product inside that campaign. No product/option identity.
//   2. Individual product rows — one row per advertised option (vendorItemId)
//      inside a single campaign.
//
// `deriveAdTargetType()` infers `target_type` from `pageType`, so a campaign
// rollup scraped from the product tab is labelled `'product'` even though it
// is campaign grain. Summing `target_type = 'product'` therefore counts a
// campaign twice: once via its rollup row and once via its member product
// rows. Observed on business date 2026-07-17, where 9 rollup rows
// (spend 64,512 — the value Coupang reports) plus 29 member rows of the
// `쿠팡윙 집중광고` campaign (spend 15,156, already inside the rollup) summed
// to 79,668.
//
// `target_type` is intentionally left alone: `deriveAdTargetType('product',
// '키워드 보기') === 'product'` is a deliberate contract for ad product-tab
// rows. Grain is tracked as a separate, explicit discriminator instead.
//
// New rows are stamped with an explicit `granularity` in
// `metaJson.data.granularity`. Rows written before that stamp existed are
// classified by identity evidence: a campaign rollup carries no option or
// listing identity at all, while a true product row always carries at least
// one. Verified against the whole table — 136 rollup rows had all three of
// (externalOptionId, listingOptionId, listingId) null; all 29 product rows
// had all three set.
//
// `externalId` is deliberately NOT part of the predicate: campaign rollup
// rows carry a synthetic descriptor there (for example
// `product::쿠팡윙 집중광고::::::29개`), so its presence proves nothing.

export type AdTargetGrain = 'campaign' | 'product';

export const AD_TARGET_GRAIN_META_KEY = 'granularity';

export interface AdTargetIdentityEvidence {
  externalOptionId?: string | null;
  listingOptionId?: string | null;
  listingId?: string | null;
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resolve the grain of a target row from its product identity evidence.
 *
 * A row is `product` grain only when it can be attributed to a specific
 * advertised option/listing. Otherwise it is a campaign rollup, whose metrics
 * already contain every member product's metrics.
 */
export function resolveAdTargetGrain(
  evidence: AdTargetIdentityEvidence,
): AdTargetGrain {
  const hasProductIdentity =
    hasValue(evidence.externalOptionId) ||
    hasValue(evidence.listingOptionId) ||
    hasValue(evidence.listingId);
  return hasProductIdentity ? 'product' : 'campaign';
}

/**
 * Narrow an untrusted `metaJson.data.granularity` value to a known grain.
 * Returns `null` for legacy rows that predate the stamp, so callers can fall
 * back to identity evidence.
 */
export function readStampedAdTargetGrain(value: unknown): AdTargetGrain | null {
  return value === 'campaign' || value === 'product' ? value : null;
}
