import type { AdListingSummary } from '@kiditem/shared/advertising';
import type { HydratedListing } from './model/strategy-types';
import type {
  ScopedAdListingReadModel,
  ScopedAdListingSummary,
} from '../application/port/out/repository/ad-listing.repository.port';

/**
 * HydratedListing → AdListingSummary (Zod schema 정합).
 *
 * ad-grade-rules, ad-budget-allocator 공통 사용 — DRY.
 * 상품 메타 필드 (abcGrade) 는 strip.
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
 * Read-model row → AdListingSummary preserving the master meta field used
 * downstream (abcGrade). Used by hub / campaign /
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

// Alias retained for legacy callers (existing mapper spec). Prefer
// `hydratedListingToSummary` in new code.
export const toListingSummary = hydratedListingToSummary;

export type { AdListingSummary };
