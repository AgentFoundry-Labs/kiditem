import type { ContentAssetSource } from '@kiditem/shared/product-content';

export const SALES_PRODUCT_CONTENT_ASSET_PORT = Symbol('SALES_PRODUCT_CONTENT_ASSET_PORT');

/**
 * Registration-ready images for one sourcing candidate, split by
 * `ContentAsset.role`.
 *
 * Only `primary`/`thumbnail`/`detail` roles are returned; detail-page inputs
 * (`detail_source`) and generated detail images are not registration photos,
 * and AI thumbnail candidates reach a mall only once adopted.
 */
export interface SalesProductRegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/**
 * The draft's representative image: the asset its content workspace points at
 * (`ContentWorkspace.currentThumbnailAssetId`, KID-313 W3a). An upload and an
 * adopted AI candidate are the same kind of row.
 */
export interface SalesProductCurrentThumbnail {
  assetId: string;
  url: string;
  source: ContentAssetSource;
  thumbnailGenerationId: string | null;
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
   * `findCurrentThumbnail` 의 배치판. 수집상품 목록처럼 후보 여러 개의 대표를
   * 한 번에 읽어야 하는 경로 전용이다 — 단건 조회를 반복하면 N+1 이 된다.
   * 대표가 없는 후보는 맵에 없다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnail>>;
}
