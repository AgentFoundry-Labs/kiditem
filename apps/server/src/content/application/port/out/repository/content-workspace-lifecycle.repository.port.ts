import type { DetailPageRevisionType } from '../../../../domain/detail-page/detail-page-revision-type';
export const CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT = Symbol(
  'CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT',
);

export interface EnsureContentWorkspaceInput {
  organizationId: string;
  ownerType: 'sales_product' | 'channel_listing' | 'direct_detail_page';
  salesProductId: string | null;
  channelListingId: string | null;
  /** 직접 상세 작업공간의 중복 방지 제목. 판매 상품 · 리스팅 작업공간은 null(이름은 소유자에게서 읽는다). */
  normalizedTitle: string | null;
  createdByUserId: string | null;
}

export interface ContentWorkspaceIdentity {
  id: string;
  normalizedTitle: string | null;
}

/** 작업공간의 상세 페이지 한 행(KID-313 W3b) — 생성 · 직접 작성 · 올린 파일 · 가져오기 어느 것이든. */
export interface ContentWorkspaceDetailPageSnapshot {
  id: string;
  source: string;
  status: string;
  title: string | null;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  errorMessage: string | null;
  currentRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentWorkspaceSnapshot {
  id: string;
  ownerType: string;
  salesProductId: string | null;
  channelListingId: string | null;
  normalizedTitle: string | null;
  status: string;
  currentDetailPageRevisionId: string | null;
  /** 대표이미지 자산(`current_thumbnail_asset_id`). */
  currentThumbnailAsset: { id: string; url: string } | null;
  /** 현재 revision 과 그 revision 이 속한 상세 페이지. */
  currentDetailPageRevision?: { id: string; detailPageId: string; revisionType: DetailPageRevisionType; createdAt: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { detailPages: number };
  detailPages?: ContentWorkspaceDetailPageSnapshot[];
}

export interface ContentWorkspaceListInput {
  organizationId: string;
  status: string;
  normalizedTitle: string | null;
  page: number;
  limit: number;
}

export interface ContentWorkspaceLifecycleRepositoryPort {
  ensureActiveWorkspace(input: EnsureContentWorkspaceInput): Promise<ContentWorkspaceIdentity>;
  /** 판매상품 초안의 살아 있는 작업공간. 아직 없으면 null — 읽기는 작업공간을 만들지 않는다. */
  findActiveSalesProductWorkspaceId(input: { organizationId: string; salesProductId: string }): Promise<string | null>;
  findDuplicateByNormalizedTitle(input: {
    organizationId: string;
    normalizedTitle: string;
  }): Promise<ContentWorkspaceSnapshot | null>;
  getById(input: {
    organizationId: string;
    workspaceId: string;
  }): Promise<ContentWorkspaceSnapshot | null>;
  listActive(input: ContentWorkspaceListInput): Promise<{
    total: number;
    rows: ContentWorkspaceSnapshot[];
  }>;
  archive(input: {
    organizationId: string;
    workspaceId: string;
    archivedAt: Date;
  }): Promise<number>;
}
