export const REGISTRABLE_THUMBNAIL_REPOSITORY_PORT = Symbol('REGISTRABLE_THUMBNAIL_REPOSITORY_PORT');

/** 몰에 올릴 대표이미지 자산 한 행과 그 판매 상품 작업공간(KID-313 W3a). */
export interface RegistrableThumbnailAssetRow {
  assetId: string;
  contentWorkspaceId: string;
  url: string;
}

export interface RegistrableThumbnailRepositoryPort {
  /**
   * 판매 상품의 활성 작업공간에서 올릴 자산. `assetId` 가 있으면 그 작업공간의 살아 있는 자산이어야 하고
   * (아니면 `foreign_asset`), 없으면 작업공간의 현재 대표이미지다(없으면 `none`). 작업공간이 없어도 `none` 이다.
   */
  findRegistrableAsset(input: {
    organizationId: string;
    salesProductId: string;
    assetId: string | null;
  }): Promise<
    | { mode: 'found'; asset: RegistrableThumbnailAssetRow }
    | { mode: 'none' }
    | { mode: 'foreign_asset' }
  >;
  /** 판매 상품마다 활성 작업공간의 현재 대표이미지 자산 id. 작업공간이 없는 상품은 맵에 없다. */
  readCurrentAssetIds(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ReadonlyMap<string, string | null>>;
  /** 조직의 살아 있는 자산 URL(사진 읽기용). */
  findAssetUrl(input: { organizationId: string; assetId: string }): Promise<string | null>;
}
