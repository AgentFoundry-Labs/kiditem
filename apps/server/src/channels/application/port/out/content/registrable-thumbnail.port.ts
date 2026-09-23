export const CHANNEL_REGISTRABLE_THUMBNAIL_PORT = Symbol('CHANNEL_REGISTRABLE_THUMBNAIL_PORT');

/**
 * 몰에 올릴 대표이미지 자산(Content 소유, KID-313 W3a). 열쇠는 판매 상품과 등록 대상이 고른 자산 id 이고,
 * 고르지 않았으면 작업공간의 현재 대표이미지다. 찾지 못하면 Content 의 404/400 을 그대로 던진다.
 * `thumbnail_update` 실행의 멱등 키 · 잠금은 (판매 상품, 계정, 자산 id) 로 잡는다 — 생성 job id 는 쓰지 않는다.
 */
export type RegistrableThumbnail = Readonly<{
  assetId: string;
  contentWorkspaceId: string;
  salesProductId: string;
  image: Readonly<{ url: string; sha256: string | null }>;
}>;

export type ThumbnailImagePayload = Readonly<{
  dataUrl: string;
  filename: string;
  mimeType: string;
  sha256: string;
}>;

export interface ChannelRegistrableThumbnailPort {
  read(input: {
    organizationId: string;
    salesProductId: string;
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnail>;
  loadImage(input: { organizationId: string; assetId: string }): Promise<ThumbnailImagePayload>;
}
