import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import type { ThumbnailReportTransition, ThumbnailUpdatePayload } from '../../../../domain/registration/thumbnail-update';

export const THUMBNAIL_EXECUTION_PERSISTENCE_PORT = Symbol('THUMBNAIL_EXECUTION_PERSISTENCE_PORT');

export type ThumbnailExecutionRow = Readonly<{
  id: string;
  generationId: string;
  status: OperationStatus;
  providerOutcome: ProviderOutcome;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  screenshotPath: string | null;
  completedAt: Date | null;
  updatedAt: Date;
  dismissedAt: Date | null;
}>;

/**
 * `ProductRegistrationExecution` 중 `executionKind = 'thumbnail_update'` 행만 쓴다. 생성 id 는
 * 동결 payload(`submissionPayloadJson.generationId`)에만 있다. 같은 생성의 살아 있는 실행 검사는
 * 생성 id 로 잡은 advisory lock 안에서 한다.
 */
export interface ThumbnailExecutionPersistencePort {
  /**
   * 조직의 활성 쿠팡 계정과 반영할 listing. 운영자가 고른 listing 은 이 조직의 살아 있는 쿠팡
   * listing 이면서 이 판매상품의 것이거나 작업공간 자신의 listing 이어야 한다(아니면 입력 오류).
   * 고르지 않았으면 작업공간 listing(살아 있지 않으면 없음 오류), 없으면 판매상품의 쿠팡 listing 이다.
   */
  readAccountEvidence(input: {
    organizationId: string;
    pickedListingId: string | null;
    workspaceListingId: string | null;
    salesProductId: string | null;
  }): Promise<{ listingAccountId: string | null; channelListingId: string | null; activeCoupangAccountIds: string[] }>;
  /** 새 실행을 `executing` 으로 만든다. owner 키가 이미 있으면 그 실행을 `replay` 로 돌려준다. */
  createExecuting(input: {
    organizationId: string;
    requestedByUserId: string | null;
    channelAccountId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string | null;
    requestHash: string;
    payload: ThumbnailUpdatePayload;
    payloadHash: string;
  }): Promise<{ mode: 'created'; executionId: string } | { mode: 'replay'; execution: ThumbnailExecutionRow } | { mode: 'live_conflict' }>;
  /**
   * 보고를 반영한다. `acceptFrom` 에 없는 상태면 `rejected`. 사진 경로 · 외부 id 는 주어질 때만
   * 덮어쓴다(운영자 확인이 올릴 때의 스크린샷을 지우지 않게).
   */
  applyReport(input: {
    organizationId: string;
    executionId: string;
    transition: ThumbnailReportTransition;
    acceptFrom: readonly OperationStatus[];
    screenshotPath: string | null;
    externalId: string | null;
  }): Promise<{ mode: 'applied'; execution: ThumbnailExecutionRow } | { mode: 'rejected'; status: OperationStatus } | { mode: 'not_found' }>;
  /**
   * owner 키로 이미 만든 실행. 없으면 null, 같은 키가 다른 생성 · 요청 해시로 쓰였으면 충돌을 던진다.
   * 재생은 Content 읽기 · 계정 결정 · 사진 읽기 · 운영 차단보다 먼저 답한다.
   */
  findOwnerReplay(input: {
    organizationId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string;
    requestHash: string;
    generationId: string;
  }): Promise<ThumbnailExecutionRow | null>;
  /** 살아 있는 실행의 동결 payload. 끝난 실행은 그 상태를, 없으면 `not_found`. */
  readLivePayload(input: { organizationId: string; executionId: string }): Promise<
    | { mode: 'live'; payload: ThumbnailUpdatePayload }
    | { mode: 'finished'; status: OperationStatus }
    | { mode: 'not_found' }
  >;
  findLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionRow[]>;
  dismissLatestFailed(input: { organizationId: string; generationId: string }): Promise<boolean>;
}
