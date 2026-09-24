import type { ContentAssetSource } from '@kiditem/shared/product-content';

export const CONTENT_ASSET_LIBRARY_REPOSITORY_PORT = Symbol(
  'CONTENT_ASSET_LIBRARY_REPOSITORY_PORT',
);

/**
 * 워크스페이스가 소유한 관리 이미지 한 표(`content_assets`, KID-313 W3a)의 저장소 계약. 운영자 업로드 ·
 * AI 후보 · 상세 이미지 · 몰 카탈로그 사진이 모두 한 행이고, 대표이미지는 워크스페이스의
 * `current_thumbnail_asset_id` 하나다. 옛 생성 그룹 · 자산 사용 · 썸네일 선택 표는 없다.
 */

export interface ContentAssetListRepositoryInput {
  organizationId: string;
  page: number;
  limit: number;
  contentWorkspaceId: string | null;
  /** AI 후보만: 이 job 의 후보. */
  thumbnailGenerationId: string | null;
}

export interface ContentAssetRow {
  id: string;
  contentWorkspaceId: string;
  source: ContentAssetSource;
  thumbnailGenerationId: string | null;
  url: string;
  assetType: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  width: number | null;
  height: number | null;
  metadata: unknown;
  isCurrentThumbnail: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** 판매 상품 작업공간의 역할 있는 사진 한 장. 채택하지 않은 AI 후보는 싣지 않는다. */
export interface SalesProductContentAssetRow {
  role: string | null;
  url: string;
  sortOrder: number;
}

/**
 * 워크스페이스가 저장한 썸네일 미리보기 목록(운영자 업로드, `role='thumbnail'`)을 통째로 바꾼다. 이 목록이
 * `listSalesProductAssets` 로 몰 추가이미지에 다시 읽힌다.
 */
export interface ReplaceWorkspaceThumbnailGalleryInput {
  organizationId: string;
  contentWorkspaceId: string;
  createdByUserId: string | null;
  urls: string[];
}

/** 판매 상품 작업공간의 현재 대표이미지 자산(`current_thumbnail_asset_id`). */
export interface SalesProductCurrentThumbnailRow {
  assetId: string;
  url: string;
  source: ContentAssetSource;
  thumbnailGenerationId: string | null;
}

export interface ContentAssetLibraryRepositoryPort {
  /** 워크스페이스의 현재 대표이미지이거나 상세 페이지의 현재 revision 이 쓰는 사진이면 `in_use`. */
  deleteAsset(input: {
    organizationId: string;
    contentAssetId: string;
    deletedAt: Date;
  }): Promise<{ status: 'deleted' | 'in_use' | 'not_found' }>;
  listAssets(input: ContentAssetListRepositoryInput): Promise<{
    total: number;
    rows: ContentAssetRow[];
  }>;
  /** 대표이미지 갤러리: 워크스페이스의 `role='thumbnail'` 자산(업로드 · AI 후보), 새것부터. 없는 워크스페이스는 404. */
  listWorkspaceThumbnailGallery(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<ContentAssetRow[]>;
  /** job 들의 살아 있는 AI 후보 자산(정렬 순서대로). */
  listThumbnailCandidates(input: {
    organizationId: string;
    thumbnailGenerationIds: readonly string[];
  }): Promise<ContentAssetRow[]>;
  /**
   * 채택: 워크스페이스의 `current_thumbnail_asset_id` 를 그 워크스페이스의 자산으로 옮긴다(Content 소유 쓰기).
   * 워크스페이스가 없거나 다른 조직이면 404, 자산이 그 워크스페이스 것이 아니면 400.
   */
  setCurrentThumbnail(input: {
    organizationId: string;
    contentWorkspaceId: string;
    assetId: string;
  }): Promise<ContentAssetRow>;
  listSalesProductAssets(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductContentAssetRow[]>;
  findSalesProductCurrentThumbnail(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductCurrentThumbnailRow | null>;
  /** 배치판. 목록 화면은 후보마다 단건 조회를 돌리면 N+1 이 되므로 반드시 이쪽을 쓴다. 대표가 없으면 맵에서 빠진다. */
  findSalesProductCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnailRow>>;
  replaceWorkspaceThumbnailGallery(
    input: ReplaceWorkspaceThumbnailGalleryInput,
  ): Promise<{ urls: string[] }>;
}
