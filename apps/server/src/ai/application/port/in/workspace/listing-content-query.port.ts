import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export interface ListingContentView {
  listingId: string;
  workspaceId: string | null;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  thumbnailUrl: string | null;
  workspaceImageUrl: string | null;
  providerMedia: Array<{ sourceUrl: string; role: string; sortOrder: number; externalOptionIds: string[] }>;
}
export interface ListingContentRequest {
  organizationId: string;
  listings: Array<{ id: string; channel: string }>;
  includeProviderMedia?: boolean;
}

export const AI_LISTING_CONTENT_QUERY_PORT = Symbol('AI_LISTING_CONTENT_QUERY_PORT');
export interface ListingContentQueryPort {
  readLatestListingThumbnails(transaction: OwnerTransaction, input: { organizationId: string; listingIds: readonly string[] }): Promise<Array<{ listingId: string; imageUrl: string }>>;
  findForListings(input: ListingContentRequest): Promise<ListingContentView[]>;
}
