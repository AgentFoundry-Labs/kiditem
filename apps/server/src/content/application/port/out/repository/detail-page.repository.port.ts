import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { DetailPageRevisionType } from '../../../domain/detail-page/detail-page-revision-type';
import type { DetailPageSource, DetailPageStatus } from '../../../domain/detail-page/detail-page-lifecycle';

export const DETAIL_PAGE_REPOSITORY_PORT = Symbol('DETAIL_PAGE_REPOSITORY_PORT');

/**
 * 상세 페이지 표 하나(`detail_pages` + `detail_page_revisions`)의 저장소 계약(KID-313 W3b). 옛
 * `content_generations` · `content_generation_groups` · `detail_page_artifacts` 를 대신한다. 현재 포인터는
 * 둘뿐이다 — 상세 페이지의 `current_revision_id` 와 워크스페이스의 `current_detail_page_revision_id` —
 * 그리고 둘 다 이 저장소만 옮긴다. 옮길지 말지는 `decideRevisionPointer`(도메인)가 정하고 여기서는 따른다.
 */

export interface DetailPageRow {
  id: string;
  organizationId: string;
  contentWorkspaceId: string;
  source: DetailPageSource;
  templateId: string | null;
  title: string | null;
  status: DetailPageStatus;
  generationInput: Record<string, unknown>;
  errorMessage: string | null;
  currentRevisionId: string | null;
  triggeredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DetailPageRevisionRow {
  id: string;
  detailPageId: string;
  revisionType: DetailPageRevisionType;
  html: string;
  imageUrls: readonly string[];
  assetUrlMap: Record<string, string>;
  source: string | null;
  sourceDigest: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface CreateDetailPageInput {
  organizationId: string;
  contentWorkspaceId: string;
  source: DetailPageSource;
  templateId: string | null;
  title: string | null;
  /** 생성은 `pending`, 그 밖은 `ready`. */
  status: DetailPageStatus;
  generationInput: Record<string, unknown>;
  triggeredByUserId: string | null;
}

export interface AppendRevisionInput {
  organizationId: string;
  detailPageId: string;
  revisionType: DetailPageRevisionType;
  html: string;
  imageUrls: readonly string[];
  assetUrlMap?: Record<string, string>;
  source?: string | null;
  sourceDigest?: string | null;
  createdByUserId: string | null;
  /** true 면 상세 페이지의 현재와 워크스페이스의 현재를 이 revision 으로 옮긴다(도메인 규칙의 결과). */
  makeCurrent: boolean;
}

export interface DetailPageRepositoryPort {
  create(transaction: OwnerTransaction, input: CreateDetailPageInput): Promise<DetailPageRow>;
  /** 워크스페이스 행을 잠근 채 revision 을 붙인다 — 같은 워크스페이스의 동시 편집이 포인터를 엇갈리게 하지 않는다. */
  appendRevision(transaction: OwnerTransaction, input: AppendRevisionInput): Promise<DetailPageRevisionRow>;
  /** 생성 job 의 상태 전이(pending → processing → ready | failed). ready 는 generated revision 과 함께만 온다. */
  setStatus(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; status: DetailPageStatus; errorMessage?: string | null },
  ): Promise<void>;
  /** 운영자가 고른 revision 을 상세 페이지 · 워크스페이스의 현재로. 그 워크스페이스의 revision 이 아니면 거절. */
  setCurrentRevision(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; revisionId: string },
  ): Promise<void>;
  findById(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRow | null>;
  listByWorkspace(input: { organizationId: string; contentWorkspaceId: string }): Promise<DetailPageRow[]>;
  listRevisions(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRevisionRow[]>;
  findRevision(input: { organizationId: string; revisionId: string }): Promise<(DetailPageRevisionRow & { contentWorkspaceId: string }) | null>;
  /** 가져온(`source`) revision 들의 사진 주소를 바꿔 쓴다(사방넷 → 우리 저장소, KID-319). digest 는 원문 것이라 그대로. */
  rewriteImportedImageUrls(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; replacements: ReadonlyMap<string, string> },
  ): Promise<{ revisionsUpdated: number }>;
}
