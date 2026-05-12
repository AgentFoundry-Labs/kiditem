// Outgoing port for the listing/master hydrated read model + the Coupang
// extension-sync listing map. Combines the two reads that target the
// `ChannelListing` + `ChannelListingOption` join because they share the
// shape and consumer set (advertising read-models + sync handlers).

import type { AdListingSummary } from '@kiditem/shared/advertising';

export const AD_LISTING_REPOSITORY_PORT = Symbol('AdListingRepositoryPort');

export interface ScopedAdListingReadModel {
  id: string;
  externalId: string;
  channelName: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    abcGrade: string | null;
    adTier: string | null;
    healthScore: number | null;
  };
}

export interface ScopedAdListingSummary extends AdListingSummary {
  masterProduct: AdListingSummary['masterProduct'] & {
    abcGrade: string | null;
    adTier: string | null;
    healthScore: number | null;
  };
}

/** Sync listing map keyed by Coupang external option/listing identifiers. */
export interface AdSyncListingMap {
  externalOptionIdMap: Map<
    string,
    {
      listingId: string;
      listingOptionId: string;
      optionId: string | null;
      externalId: string;
    }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface AdListingRepositoryPort {
  /**
   * listing-id list → tenant-scoped listing + master meta map.
   * Soft-deleted listings are excluded; missing masters drop the row.
   */
  findScopedAdListings(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<Map<string, ScopedAdListingReadModel>>;

  /**
   * Build the Coupang sync listing map from active channel listings and
   * options. Used by the extension-sync handlers to resolve incoming
   * `vendorItemId` / `externalId` payloads to internal listing rows.
   */
  buildAdSyncListingMap(organizationId: string): Promise<AdSyncListingMap>;

  /**
   * Change the master product's `adTier` for the given listing id. Returns
   * `false` when the listing/master is not tenant-scoped or missing; callers
   * throw `NotFoundException` based on the boolean. Pass `null` to OFF.
   */
  changeAdTier(
    listingId: string,
    organizationId: string,
    nextTier: string | null,
  ): Promise<boolean>;

  /**
   * IDOR guard helper — confirm a listing id belongs to the organization and
   * is not soft-deleted. Returns `true` only when the row exists in scope.
   */
  verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean>;
}
