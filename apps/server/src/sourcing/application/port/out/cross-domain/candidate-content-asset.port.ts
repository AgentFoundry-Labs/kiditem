export const SOURCING_SALES_PRODUCT_CONTENT_ASSET_PORT = Symbol(
  'SOURCING_SALES_PRODUCT_CONTENT_ASSET_PORT',
);

/**
 * Registration images owned by the candidate's content workspace, split by
 * `ContentAsset.role`. `source` role assets are never returned — they are the
 * raw scrape originals and do not meet the Coupang product-image spec.
 */
export interface SalesProductRegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/**
 * The candidate's saved representative thumbnail, owned by its AI content
 * workspace. Sourcing reads it as a fallback for
 * `RegistrationTarget.selectedThumbnailUrl`: a candidate with no preparation
 * can only save a representative through the workspace, so without this the
 * saved selection is lost on every reload.
 */
export interface SalesProductCurrentThumbnail {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
}

export interface SalesProductContentAssetPort {
  loadRegistrationMedia(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<{
    registrationImages: SalesProductRegistrationImages;
    currentThumbnail: SalesProductCurrentThumbnail | null;
  }>;
  listRegistrationImages(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductRegistrationImages>;
  findCurrentThumbnail(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductCurrentThumbnail | null>;
  /**
   * 배치판. 수집상품 **목록**은 카드마다 저장된 대표를 보여줘야 하는데,
   * 후보별 단건 조회를 돌리면 N+1 이 된다. 목록 경로는 이쪽만 쓴다.
   * 대표가 없는 후보는 맵에 없다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnail>>;
}
