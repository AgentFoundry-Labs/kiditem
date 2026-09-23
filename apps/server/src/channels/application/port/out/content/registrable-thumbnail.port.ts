export const CHANNEL_REGISTRABLE_THUMBNAIL_PORT = Symbol('CHANNEL_REGISTRABLE_THUMBNAIL_PORT');

/** 몰에 올릴 수 있는 승인된 생성 썸네일(Content 소유). 찾지 못하면 Content 의 404/400 을 그대로 던진다. */
export type RegistrableThumbnail = Readonly<{
  generationId: string;
  contentWorkspaceId: string;
  salesProductId: string | null;
  /** 작업공간이 listing 소유이면 그 listing. */
  channelListingId: string | null;
  /** 작업공간 이름. Wing 상품명은 Channels 가 listing 이름과 함께 정한다. */
  workspaceDisplayName: string;
  image: Readonly<{ url: string; assetId: string | null }>;
}>;

export type ThumbnailImagePayload = Readonly<{
  dataUrl: string;
  filename: string;
  mimeType: string;
  sha256: string;
}>;

export interface ChannelRegistrableThumbnailPort {
  read(input: { organizationId: string; generationId: string }): Promise<RegistrableThumbnail>;
  loadImage(input: { organizationId: string; generationId: string; url: string }): Promise<ThumbnailImagePayload>;
}
