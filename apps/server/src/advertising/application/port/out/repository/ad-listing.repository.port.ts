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
  };
}

export interface ScopedAdListingSnapshot {
  listings: Map<string, ScopedAdListingReadModel>;
  /**
   * Official cutoff of the Products ABC publication the listing grades were
   * read from, or `null` when Products has never published and no grade
   * membership is measured.
   */
  abcOfficialCutoffDate: string | null;
}

export interface ScopedAdListingSummary extends AdListingSummary {
  masterProduct: AdListingSummary['masterProduct'] & {
    abcGrade: string | null;
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
   * The same listings with the ABC cutoff, read in one snapshot so a
   * publication committing between two reads cannot pair its cutoff with
   * grades read before it. The cutoff is read even without listing ids.
   */
  findScopedAdListingsWithAbcCutoff(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<ScopedAdListingSnapshot>;

  /**
   * IDOR guard helper — confirm a listing id belongs to the organization and
   * is active. Returns `true` only when the row exists in scope.
   */
  verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean>;
}
