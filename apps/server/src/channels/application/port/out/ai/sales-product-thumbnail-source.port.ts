export const SALES_PRODUCT_THUMBNAIL_SOURCE_PORT = Symbol('SALES_PRODUCT_THUMBNAIL_SOURCE_PORT');

/**
 * 이 판매상품을 위해 만든 생성 썸네일 주소(AI 소유). 초안이 든 사진은 Channels 가 스스로 읽고,
 * 둘을 합친 것이 대표 사진으로 고를 수 있는 전부다.
 */
export interface SalesProductThumbnailSourcePort {
  listGeneratedThumbnailUrls(organizationId: string, salesProductId: string): Promise<string[]>;
}
