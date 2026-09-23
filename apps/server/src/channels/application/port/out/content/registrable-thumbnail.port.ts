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
  /** `read` 와 같되 고른 자산도 현재 대표이미지도 없으면 null. */
  find(input: {
    organizationId: string;
    salesProductId: string;
    selectedThumbnailAssetId: string | null;
  }): Promise<RegistrableThumbnail | null>;
  loadImage(input: { organizationId: string; assetId: string }): Promise<ThumbnailImagePayload>;
  /**
   * 판매 상품마다 작업공간의 현재 대표이미지 자산 id(등록 상태 reader 의 재전송 필요 비교, KID-320). 작업공간이 없는
   * 상품은 맵에 없고, 현재 대표이미지가 없으면 null. 등록 대상이 고른 자산은 호출자가 먼저 본다.
   */
  readCurrentAssetIds(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ReadonlyMap<string, string | null>>;
}
