import type { ThumbnailEditorCandidate, ThumbnailEditorInputImage } from '../../../../domain/model/thumbnail-editor';
import type { ThumbnailGenerationListScope } from '../../../../domain/thumbnail-generation-subject';
import type { AiDirectJobRequest } from '../runtime/ai-direct-job-operations.port';
import type { ProductGenerationChildIdentity } from '../../../service/product-generation-child-identity';

export const THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT = Symbol('THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT');

/**
 * 대표이미지 생성 job 저장소(KID-313 W3a). `thumbnail_generations` 는 job 만 갖는다(상태 · 방법 · 프롬프트 ·
 * 입력 메타 · 오류 · 시도). 결과 후보는 성공 전이와 같은 트랜잭션에서 `content_assets`(source ai, role thumbnail,
 * thumbnail_generation_id) 행이 된다. 입력 사진 · 원본 URL · 편집 분석은 `input_meta` 에 있다
 * (`domain/thumbnail/thumbnail-job-input-meta`). 후보 · job 이 워크스페이스의 대표이미지로 채택돼 있으면 바꾸지 않는다.
 */

export interface ThumbnailGenerationWorkspaceSummary {
  id: string;
  salesProductId: string | null;
  name: string;
  imageUrl: string | null;
  category: string | null;
}

export interface ThumbnailJobRow {
  id: string;
  contentWorkspaceId: string;
  status: string;
  method: string;
  prompt: string | null;
  inputMeta: unknown;
  errorMessage: string | null;
  attemptCount: number;
  triggeredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThumbnailGenerationWorkspaceContext {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  images: Array<{
    url: string;
    role: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
}

export interface ThumbnailGenerationProjectionStatus {
  id: string;
  status: string;
  inputMeta?: unknown;
  errorMessage: string | null;
}

export interface ThumbnailGenerationAttemptChange {
  fromStatus: string;
  attemptNumber: number;
}

export interface ThumbnailGenerationStatusChange {
  fromStatus: string;
}

export interface ThumbnailGenerationDirectCancellation {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  preserved: boolean;
}

export type OpenPendingThumbnailDirectGenerationInput = {
  organizationId: string;
  originalUrl: string;
  method: string;
  inputMeta: unknown;
  triggeredByUserId?: string | null;
  inputImages: ThumbnailEditorInputImage[];
  productGenerationIdentity?: ProductGenerationChildIdentity;
  /** 생성 기록과 같은 트랜잭션에서 prepare할 AI job. */
  directJob: AiDirectJobRequest;
} & (
  | {
      subject: 'editor';
      contentWorkspaceId: string;
    }
  | {
      subject: 'sales_product';
      salesProductId: string;
      contentWorkspaceId?: string | null;
    }
  | {
      subject: 'standalone';
      contentWorkspaceId?: string | null;
    }
);

export interface ThumbnailGenerationLedgerRepositoryPort {
  findWorkspaceForThumbnailEditor(
    contentWorkspaceId: string,
    organizationId: string,
  ): Promise<{
    id: string;
    name: string;
    imageUrl: string | null;
    category: string | null;
    organizationId: string;
  } | null>;
  findGenerationRows(
    organizationId: string,
    opts?: {
      contentWorkspaceId?: string | null;
      scope?: ThumbnailGenerationListScope;
      limit?: number | null;
    },
  ): Promise<ThumbnailJobRow[]>;
  findGenerationOrThrow(id: string, organizationId: string): Promise<ThumbnailJobRow>;
  /** 작업공간 요약. 리스팅 이름이 없는 작업공간은 그 행들의 `inputMeta.productName` 으로 부른다. */
  findGenerationWorkspaces(
    rows: Array<{ contentWorkspaceId: string | null; inputMeta?: unknown }>,
    organizationId: string,
  ): Promise<Map<string, ThumbnailGenerationWorkspaceSummary>>;
  findWorkspaceForThumbnailJob(
    contentWorkspaceId: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationWorkspaceContext | null>;
  findWorkspacesForThumbnailJobs(
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, ThumbnailGenerationWorkspaceContext>>;
  findActiveJobForWorkspace(
    contentWorkspaceId: string,
    organizationId: string,
    method: string,
  ): Promise<ThumbnailJobRow | null>;
  findRecentAutoJob(
    contentWorkspaceId: string,
    organizationId: string,
    cooldownStart: Date,
  ): Promise<{ id: string } | null>;
  findAutoBatchCandidates(organizationId: string, take: number): Promise<Array<{ id: string }>>;

  openPendingDirectGeneration(input: OpenPendingThumbnailDirectGenerationInput): Promise<{
    status: 'created' | 'existing';
    generationId: string;
  }>;
  /** 자동 · 일괄 편집 job(직접 job 없이 재편집 경로로 돈다). 입력은 `inputMeta` 에 같이 넣는다. */
  openPendingEditorJob(input: {
    organizationId: string;
    contentWorkspaceId: string;
    originalUrl: string;
    method: string;
    inputMeta: Record<string, unknown>;
    triggeredByUserId?: string | null;
  }): Promise<ThumbnailJobRow>;
  /**
   * 재편집 job을 다시 건다: 이 생성의 살아 있는 재편집 job을 취소하고 새 job을 한 트랜잭션에서 prepare한다
   * (옛 `ai_direct_jobs` upsert 재시작과 같은 결과 — 돌던 워커는 heartbeat에서 취소를 보고 멈춘다).
   */
  restartReeditJob(input: {
    organizationId: string;
    generationId: string;
    directJob: AiDirectJobRequest;
  }): Promise<{ jobId: string }>;
  cancelDirectGeneration(input: {
    organizationId: string;
    generationId: string;
    reason: string;
  }): Promise<ThumbnailGenerationDirectCancellation>;
  /** job 과 그 후보 자산을 지운다. 후보가 대표이미지면 409. */
  deleteGeneration(id: string, organizationId: string): Promise<void>;
  /** 후보 자산 하나를 지운다. 마지막 후보면 job 도 지운다. 대표이미지면 409, 그 job 의 후보가 아니면 null. */
  removeCandidate(input: {
    id: string;
    organizationId: string;
    assetId: string;
  }): Promise<{ generationDeleted: boolean; remaining: number } | null>;
  /** 끝난 job 을 pending 으로 되돌리고 후보를 지운다. 입력 사진은 `inputMeta` 에 남긴다. */
  resetGenerationForReEdit(input: {
    id: string;
    organizationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box' | null;
  }): Promise<ThumbnailGenerationStatusChange | null>;
  /** 재편집 결과: running job 의 후보를 바꾸고 succeeded 로. */
  replaceLegacyEditResult(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: Record<string, unknown>;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  markGenerationFailed(
    id: string,
    organizationId: string,
    message: string,
  ): Promise<ThumbnailGenerationAttemptChange | null>;

  claimForDirectProjection(input: {
    generationId: string;
    organizationId: string;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  /** 직접 job 성공: 후보 자산 쓰기와 succeeded 전이가 한 트랜잭션. 요청 필드는 `inputMeta` 에 병합한다. */
  projectDirectSuccess(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    projection: Record<string, unknown>;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  projectDirectFailure(input: {
    generationId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  findGenerationProjectionStatus(input: {
    organizationId: string;
    generationId: string;
  }): Promise<ThumbnailGenerationProjectionStatus | null>;
  findRecentlyTerminalGenerations(input: {
    organizationId: string;
    since: Date;
    limit: number;
  }): Promise<Array<{ id: string; status: string; errorMessage: string | null }>>;
  findStaleNonTerminalGenerations(input: {
    organizationId: string;
    staleBefore: Date;
    limit: number;
  }): Promise<Array<{ id: string }>>;
}
