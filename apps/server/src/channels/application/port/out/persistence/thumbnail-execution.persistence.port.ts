import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import type { ThumbnailReportTransition, ThumbnailUpdatePayload } from '../../../../domain/registration/thumbnail-update';

export const THUMBNAIL_EXECUTION_PERSISTENCE_PORT = Symbol('THUMBNAIL_EXECUTION_PERSISTENCE_PORT');

export type ThumbnailExecutionRow = Readonly<{
  id: string;
  generationId: string;
  status: OperationStatus;
  providerOutcome: ProviderOutcome;
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
  /** 조직의 활성 쿠팡 계정과, listing 이 주어지면 그 listing 의 계정(조직 범위 확인 포함). */
  readAccountEvidence(input: {
    organizationId: string;
    channelListingId: string | null;
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
  /** 보고를 반영한다. 받을 수 없는 상태면 `rejected`. */
  applyReport(input: {
    organizationId: string;
    executionId: string;
    transition: ThumbnailReportTransition;
    screenshotPath: string | null;
    externalId: string | null;
  }): Promise<{ mode: 'applied'; execution: ThumbnailExecutionRow } | { mode: 'rejected'; status: OperationStatus } | { mode: 'not_found' }>;
  findLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionRow[]>;
  dismissLatestFailed(input: { organizationId: string; generationId: string }): Promise<boolean>;
}
