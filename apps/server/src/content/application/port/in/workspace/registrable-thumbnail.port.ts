export const REGISTRABLE_THUMBNAIL_PORT = Symbol('REGISTRABLE_THUMBNAIL_PORT');

/**
 * Content 가 몰 반영(`thumbnail_update`)에 내주는 것(KID-313 W3a): 판매 상품 작업공간의 대표이미지 자산
 * 하나와 그 사진. 등록 대상이 자산을 골랐으면 그것, 아니면 작업공간의 현재 대표이미지
 * (`ContentWorkspace.current_thumbnail_asset_id`)다 — 생성 job id 는 더 이상 열쇠가 아니다. 운영자가 올린
 * 업로드본과 AI 후보가 같은 `content_assets` 행이라 어느 쪽을 골라도 같은 길로 몰에 간다.
 * 몰 반영 상태는 Channels 소유라 여기에 없다. 자산 · 작업공간이 없거나 그 상품의 것이 아니면 404/400 을 던진다.
 */
export interface RegistrableThumbnailView {
  assetId: string;
  contentWorkspaceId: string;
  salesProductId: string;
  image: { url: string; sha256: string | null };
}

export interface RegistrableThumbnailPort {
  readRegistrableThumbnail(input: {
    organizationId: string;
    salesProductId: string;
    /** 등록 대상이 고른 자산. null 이면 작업공간의 현재 대표이미지. */
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnailView>;
  /** `readRegistrableThumbnail` 과 같되 고른 자산도 현재 대표이미지도 없으면 null(등록 준비가 쓴다). */
  findRegistrableThumbnail(input: {
    organizationId: string;
    salesProductId: string;
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnailView | null>;
  /** 자산의 사진을 크기·형식 검사 뒤 data URL 로 돌려준다. */
  loadThumbnailImage(input: { organizationId: string; assetId: string }): Promise<{
    dataUrl: string;
    filename: string;
    mimeType: string;
    sha256: string;
  }>;
}
