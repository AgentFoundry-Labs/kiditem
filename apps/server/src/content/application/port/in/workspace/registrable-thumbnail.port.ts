export const REGISTRABLE_THUMBNAIL_PORT = Symbol('REGISTRABLE_THUMBNAIL_PORT');

/**
 * Content 가 몰 반영에 내주는 것: 승인된 생성 썸네일과 그 사진. 몰 반영 상태는 Channels 소유라
 * 여기에 없다. 몰의 상품명도 Channels 가 정하므로 작업공간 이름만 준다. 생성 · 사진 · 작업공간이
 * 없으면 404 를 던진다.
 */
export interface RegistrableThumbnailView {
  generationId: string;
  contentWorkspaceId: string;
  salesProductId: string | null;
  channelListingId: string | null;
  workspaceDisplayName: string;
  image: { url: string; assetId: string | null };
}

export interface RegistrableThumbnailPort {
  readRegistrableThumbnail(input: { organizationId: string; generationId: string }): Promise<RegistrableThumbnailView>;
  /** 저장소 사진이나 data URL 을 크기·형식 검사 뒤 data URL 로 돌려준다. */
  loadThumbnailImage(input: { organizationId: string; generationId: string; url: string }): Promise<{
    dataUrl: string;
    filename: string;
    mimeType: string;
    sha256: string;
  }>;
}
