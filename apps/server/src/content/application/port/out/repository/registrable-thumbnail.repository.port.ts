export const REGISTRABLE_THUMBNAIL_REPOSITORY_PORT = Symbol('REGISTRABLE_THUMBNAIL_REPOSITORY_PORT');

export interface RegistrableThumbnailGenerationRow {
  contentWorkspaceId: string;
  selectedUrl: string | null;
  candidates: Array<{ url: string | null }>;
  /** 이 생성에서 고른 관리 사진 자산(가장 최근 선택). 없으면 null. */
  selectedAssetId: string | null;
}

export interface RegistrableThumbnailWorkspaceRow {
  displayName: string | null;
  salesProductId: string | null;
  channelListingId: string | null;
  /** 작업공간 listing 이 살아 있는 쿠팡 listing 이면 그 이름. */
  listingChannelName: string | null;
}

export interface RegistrableThumbnailRepositoryPort {
  findGeneration(generationId: string, organizationId: string): Promise<RegistrableThumbnailGenerationRow | null>;
  /**
   * 활성 작업공간. listing 소유 작업공간인데 그 listing 이 살아 있는 쿠팡 listing 이 아니면 null
   * (몰에 올릴 곳이 없다).
   */
  findRegistrableWorkspace(contentWorkspaceId: string, organizationId: string): Promise<RegistrableThumbnailWorkspaceRow | null>;
}
