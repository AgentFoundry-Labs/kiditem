import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export interface ListingContentView {
  listingId: string;
  workspaceId: string | null;
  detailPageRevisionId: string | null;
  thumbnailUrl: string | null;
  workspaceImageUrl: string | null;
  providerMedia: Array<{ sourceUrl: string; role: string; sortOrder: number; externalOptionIds: string[] }>;
}
export interface ListingContentRequest {
  organizationId: string;
  /**
   * 리스팅과 그 리스팅이 파는 판매 상품(KID-313 W3 리뷰 M1). 콘텐츠는 판매 상품의 작업공간에 있다 — 등록이 리스팅을
   * 작업공간에 붙이지 않으므로 Content 는 `salesProductId` 로 상품 작업공간을 먼저 찾고, 없으면(카탈로그 import 로만
   * 생긴 리스팅) 리스팅 소유 작업공간을 쓴다.
   */
  listings: Array<{ id: string; channel: string; salesProductId: string | null }>;
  includeProviderMedia?: boolean;
}

export const AI_LISTING_CONTENT_QUERY_PORT = Symbol('AI_LISTING_CONTENT_QUERY_PORT');
export interface ListingContentQueryPort {
  readLatestListingThumbnails(transaction: OwnerTransaction, input: { organizationId: string; listings: ReadonlyArray<{ id: string; salesProductId: string | null }> }): Promise<Array<{ listingId: string; imageUrl: string }>>;
  findForListings(input: ListingContentRequest): Promise<ListingContentView[]>;
}
