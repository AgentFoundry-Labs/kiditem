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

export const CHANNEL_LISTING_CONTENT_PORT = Symbol('CHANNEL_LISTING_CONTENT_PORT');
export interface ChannelListingContentPort {
  findForListings(input: ListingContentRequest): Promise<ListingContentView[]>;
}
