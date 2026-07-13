// Outgoing port for the listing-owned advertising read model + the Coupang
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
  channelAccountId: string;
  externalOptionIdMap: Map<
    string,
    {
      listingId: string;
      listingOptionId: string;
      externalId: string;
    }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface AdListingRepositoryPort {
  /**
   * listing-id list → tenant-scoped listing advertising metadata.
   * The legacy `masterProduct` response key is populated from ChannelListing
   * so public API consumers do not need an immediate response-shape migration.
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
  buildAdSyncListingMap(
    organizationId: string,
    channelAccountId?: string,
  ): Promise<AdSyncListingMap>;

  /**
   * Change the channel listing's `adTier`. Returns `false` when the listing is
   * not tenant-scoped or inactive; callers
   * throw `NotFoundException` based on the boolean. Pass `null` to OFF.
   */
  changeAdTier(
    listingId: string,
    organizationId: string,
    nextTier: string | null,
  ): Promise<boolean>;

  /**
   * IDOR guard helper — confirm a listing id belongs to the organization and
   * is active. Returns `true` only when the row exists in scope.
   */
  verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean>;
}
