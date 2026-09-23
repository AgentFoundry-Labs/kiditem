export const SALES_PRODUCT_THUMBNAIL_SOURCE_PORT = Symbol('SALES_PRODUCT_THUMBNAIL_SOURCE_PORT');

/**
 * 이 판매상품을 위해 만든 생성 썸네일 주소(AI 소유). 초안이 든 사진은 Channels 가 스스로 읽고,
 * 둘을 합친 것이 대표 사진으로 고를 수 있는 전부다.
 */
export interface SalesProductThumbnailSourcePort {
  listGeneratedThumbnailUrls(organizationId: string, salesProductId: string): Promise<string[]>;
  /**
   * 초안마다 운영자가 저장한 대표 썸네일 주소. 목록 한 쪽을 한 번에 읽는다(N+1 없음).
   * 저장한 대표가 없는 초안은 맵에 없다.
   */
  findRepresentativeThumbnailUrls(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, string>>;
}
