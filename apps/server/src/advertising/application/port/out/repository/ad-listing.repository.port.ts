// Outgoing port for the listing-owned advertising read model. The listing
// and option joins are kept behind this contract so API reads and source
// owners do not depend on Prisma directly.

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
