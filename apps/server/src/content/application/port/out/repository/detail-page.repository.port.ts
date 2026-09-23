import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { DetailPageRevisionType } from '../../../../domain/detail-page/detail-page-revision-type';
import type { DetailPageSource, DetailPageStatus } from '../../../../domain/detail-page/detail-page-lifecycle';

export const DETAIL_PAGE_REPOSITORY_PORT = Symbol('DETAIL_PAGE_REPOSITORY_PORT');

/**
 * 상세 페이지 표 하나(`detail_pages` + `detail_page_revisions`)의 저장소 계약(KID-313 W3b). 옛
 * `content_generations` · `content_generation_groups` · `detail_page_artifacts` 를 대신한다. 현재 포인터는
 * 둘뿐이다 — 상세 페이지의 `current_revision_id` 와 워크스페이스의 `current_detail_page_revision_id` —
 * 그리고 둘 다 이 저장소만 옮긴다. 옮길지 말지는 워크스페이스 행을 잠근 채 `decideRevisionPointer`(도메인)를
 * 각 포인터의 현재 revision 에 대고 따른다 — 잠금 밖에서 정하면 동시 저장이 포인터를 엇갈리게 한다.
 *
 * AI 생성은 `pending → processing → ready | failed` 이고 `ready` 는 결과(`generation_result`)를 적는 것과
 * 함께만 온다(`completeGeneration`). HTML 은 웹 템플릿이 그 결과로 그리고, 첫 저장이 `generated` revision 이 된다.
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
  /** AI 결과(`templateId` · `result` · `imageUrls` · `processedImages`). 생성이 아니거나 아직이면 `{}`. */
  generationResult: Record<string, unknown>;
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
  /** 생성은 `pending`, 그 밖은 `ready`(`initialDetailPageStatus`). 다르면 거절한다. */
  status: DetailPageStatus;
  generationInput: Record<string, unknown>;
  triggeredByUserId: string | null;
  /** 결정적 id(상품 생성의 자식 생성 identity). 없으면 새로 만든다. */
  id?: string;
}

/**
 * 편집기 저장(`editor_save`)은 종류를 저장소가 워크스페이스 잠금 안에서 정한다(W3 리뷰 S1): 현재 revision 이 없는
 * 생성 페이지의 첫 저장만 `generated`, 나머지는 `manual_edit`. 잠금 밖에서 정하면 동시 첫 저장 둘이 모두 기계 것이 된다.
 */
export const EDITOR_SAVE = 'editor_save' as const;
export type AppendRevisionKind = DetailPageRevisionType | typeof EDITOR_SAVE;

export interface AppendRevisionInput {
  organizationId: string;
  detailPageId: string;
  revisionType: AppendRevisionKind;
  html: string;
  imageUrls: readonly string[];
  assetUrlMap?: Record<string, string>;
  source?: string | null;
  sourceDigest?: string | null;
  createdByUserId: string | null;
  createdAt?: Date;
}

export interface AppendedRevision extends DetailPageRevisionRow {
  contentWorkspaceId: string;
  /** 이 상세 페이지의 현재가 되었는가. */
  becamePageCurrent: boolean;
  /** 워크스페이스의 현재(몰이 읽는 것)가 되었는가. */
  becameWorkspaceCurrent: boolean;
}

export interface DetailPageRepositoryPort {
  runInTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T>;
  create(transaction: OwnerTransaction, input: CreateDetailPageInput): Promise<DetailPageRow>;
  /** 워크스페이스 행을 잠근 채 revision 을 붙이고 두 포인터를 도메인 규칙대로 옮긴다. */
  appendRevision(transaction: OwnerTransaction, input: AppendRevisionInput): Promise<AppendedRevision>;
  /**
   * 생성 job 의 상태 전이(pending → processing, → failed, failed → pending 재시도). `ready` 는 여기로 오지
   * 않는다 — `completeGeneration` 만 결과와 함께 연다. 허락되지 않은 전이는 Conflict.
   */
  setStatus(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; status: DetailPageStatus; errorMessage?: string | null },
  ): Promise<void>;
  /** `processing → ready` 와 결과 · 제목 기록을 한 번에. processing 이 아니면 Conflict(끝난 페이지는 그대로). */
  completeGeneration(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; title: string; generationResult: Record<string, unknown> },
  ): Promise<void>;
  /** 운영자가 고른 revision 을 상세 페이지 · 워크스페이스의 현재로. 그 워크스페이스의 revision 이 아니면 BadRequest. */
  setCurrentRevision(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; revisionId: string },
  ): Promise<void>;
  rename(transaction: OwnerTransaction, input: { organizationId: string; detailPageId: string; title: string }): Promise<boolean>;
  /**
   * 지운다(soft). 워크스페이스의 현재가 이 페이지의 것이었으면 남은 페이지 중 가장 최근에 바뀐 것의 현재로
   * 옮기고, 남은 것이 없으면 비운다.
   */
  markDeleted(transaction: OwnerTransaction, input: { organizationId: string; detailPageId: string }): Promise<boolean>;
  findById(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRow | null>;
  /** 워크스페이스를 주지 않으면 조직의 최근 페이지(최대 100). 지운 페이지는 없다. */
  listByWorkspace(input: { organizationId: string; contentWorkspaceId: string | null }): Promise<DetailPageRow[]>;
  listRevisions(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRevisionRow[]>;
  findRevision(input: { organizationId: string; revisionId: string }): Promise<(DetailPageRevisionRow & { contentWorkspaceId: string }) | null>;
  /**
   * 살아 있는 작업공간의 revision 하나 — `revisionId` 를 주면 그 revision(이 작업공간 · 조직의 살아 있는 상세 페이지의
   * 것이어야 한다), 없으면 워크스페이스의 현재. 어느 쪽이든 없으면 null. 몰 상세 렌더가 쓴다.
   */
  findWorkspaceRevision(input: {
    organizationId: string;
    contentWorkspaceId: string;
    revisionId: string | null;
  }): Promise<DetailPageRevisionRow | null>;
  /** 가져온(`source`) revision 들의 사진 주소를 바꿔 쓴다(사방넷 → 우리 저장소, KID-319). digest 는 원문 것이라 그대로. */
  rewriteImportedImageUrls(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; replacements: ReadonlyMap<string, string> },
  ): Promise<{ revisionsUpdated: number }>;
}
