import type { AdListingSummary } from '@kiditem/shared/advertising';
import type { HydratedListing } from '../services/types';
import type {
  ScopedAdListingReadModel,
  ScopedAdListingSummary,
} from '../adapter/out/prisma/ad-listing.query';

/**
 * HydratedListing → AdListingSummary (Zod schema 정합).
 *
 * 3 sub-service (ad-grade-rules, ad-budget-allocator, ad-exposure) 공통 사용 — DRY.
 * ad/inventory 메타 필드 (abcGrade, adTier, healthScore) 는 strip.
 */
export function hydratedListingToSummary(listing: HydratedListing): {
  listingId: string;
  externalId: string;
  channelName: string | null;
  masterProduct: { id: string; code: string; name: string };
  option: null;
} {
  return {
    listingId: listing.id,
    externalId: listing.externalId,
    channelName: listing.channelName,
    masterProduct: {
      id: listing.masterProduct.id,
      code: listing.masterProduct.code,
      name: listing.masterProduct.name,
    },
    option: null,
  };
}

/**
 * Backwards-compatible alias retained because three sub-services (ad-grade-rules,
 * ad-exposure, ad-budget-allocator) call it under the original name. The
 * orchestrator side keeps it identical so we don't create churn that masks
 * structural diffs.
 */
export const toListingSummary = hydratedListingToSummary;

/**
 * Read-model row → AdListingSummary preserving the master meta fields used
 * downstream (abcGrade, adTier, healthScore). Used by hub / campaign /
 * benchmark services that already loaded ScopedAdListingReadModel rows.
 */
export function scopedListingToSummary(
  listing: ScopedAdListingReadModel,
): ScopedAdListingSummary {
  return {
    listingId: listing.id,
    externalId: listing.externalId,
    channelName: listing.channelName,
    masterProduct: listing.masterProduct,
    option: null,
  };
}

/**
 * Re-export under the legacy name so consumers that already imported
 * `toAdListingSummary` from the old location continue to compile.
 */
export const toAdListingSummary = scopedListingToSummary;

export type { AdListingSummary };
