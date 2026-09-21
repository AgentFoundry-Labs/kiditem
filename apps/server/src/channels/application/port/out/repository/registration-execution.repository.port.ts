import type { MarketplaceSubmissionResult } from '@kiditem/shared/channel-listing';
import type { ProductPreparationStatus } from '@kiditem/shared/sourcing';
import type { ChannelsRepositoryTransaction } from '../transaction/repository-transaction';
import type { RegistrationExecutionProviderOutcome } from '../../../../domain/registration-execution-state';

export const REGISTRATION_EXECUTION_REPOSITORY_PORT = Symbol(
  'REGISTRATION_EXECUTION_REPOSITORY_PORT',
);

export interface RegistrationExecutionRegisteredResult {
  preparationId: string;
  status: 'registered';
  listingId: string;
}

/**
 * 한 실행이 동결해 둔 제출본. 실행이 시작된 뒤에는 이 값만 공급자에게 나간다 —
 * 초안이 그 사이 편집돼도 제출된 것은 바뀌지 않는다.
 */
export interface FrozenRegistrationSubmission {
  executionId: string;
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
  displayName: string;
  /** 초안이 지금 머무는 상태. 울타리는 그대로 비추기만 한다. */
  status: ProductPreparationStatus;
  submissionKey: string;
  submissionPayloadJson: unknown;
  submissionPayloadHash: string;
  providerSubmissionId: string | null;
  registrationResult: unknown;
  providerOutcome: RegistrationExecutionProviderOutcome;
  submissionLeaseToken: string | null;
  isRetry: boolean;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
}

export type RegistrationExecutionClaimResult =
  | FrozenRegistrationSubmission
  | RegistrationExecutionRegisteredResult;

export interface PrepareRegistrationExecutionInput {
  organizationId: string;
  sourceCandidateId: string;
  requestedByUserId: string | null;
  channelAccountId: string;
  displayName: string;
  registrationInput: Record<string, unknown>;
  idempotencyKey: string;
  providerAbsenceVerified?: boolean;
}

export interface RegistrationExecutionResult {
  /** Assigned in the frozen preparation; absent on historical executions. */
  kidItemCode?: string;
  executionId: string;
  preparationId: string;
  requestHash: string;
  status: 'prepared' | 'executing' | 'reconciling' | 'succeeded';
  providerOutcome: 'not_attempted' | 'uncertain' | 'succeeded';
  submissionLeaseToken: string | null;
  expectedProviderAccountId: string;
  listingId: string | null;
}

/**
 * 제출되지 않은 채 닫힌 실행. `RegistrationExecutionResult` 는 살아 있는
 * 실행(prepared~succeeded)만 표현하므로 종료 상태를 섞지 않는다.
 */
export interface ClosedRegistrationExecutionResult {
  executionId: string;
  preparationId: string;
  status: 'failed';
  providerOutcome: 'definitive_failure';
}

export interface RegistrationExecutionRepositoryPort {
  /**
   * 후보 삭제 준비. 제출 흔적이 전혀 없는 외부 등록 의사만 취소한다.
   * 호출자(Sourcing)의 트랜잭션에서 실행되어 후보 종료와 함께 커밋된다.
   */
  cancelUnstartedExecutions(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      cancelledAt: Date;
    },
  ): Promise<number>;

  prepare(
    input: PrepareRegistrationExecutionInput,
  ): Promise<RegistrationExecutionResult>;

  start(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult>;

  get(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult>;

  markUnresolved(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<RegistrationExecutionResult>;

  /**
   * 마켓에 아무것도 제출되지 않은 채 끝난 실행을 확정 실패로 닫는다.
   *
   * 제출 여부를 모르는 실패는 `markUnresolved` 로 `reconciling` 에 남겨 중복 등록을
   * 막아야 한다. 그런데 확장이 폼을 채우다 실패한 경우는 제출 단계에 닿지도 못한
   * 것이라 재시도가 안전하다. 이 둘을 구분하지 않으면 폼 채움 실패 한 번에 그
   * 수집상품이 영구히 등록 불가가 된다(라이브 사례).
   *
   * 공급자 식별자(등록상품ID·결과)가 하나라도 기록돼 있으면 호출자가 무엇을
   * 주장하든 거부한다. 기록된 성공을 실패로 되돌릴 수 있는 경로는 없다.
   */
  markNotSubmitted(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ClosedRegistrationExecutionResult>;

  claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<RegistrationExecutionClaimResult>;

  loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenRegistrationSubmission>;

  markProviderAttemptStarted(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
  ): Promise<void>;

  recordProviderResult(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    result: MarketplaceSubmissionResult,
  ): Promise<FrozenRegistrationSubmission>;

  markFailed(input: {
    organizationId: string;
    preparationId: string;
    submissionLeaseToken: string;
    error: string;
    providerOutcome?: 'definitive_failure';
  }): Promise<{ preparationId: string; status: 'failed' }>;

  finalizeRegistered(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    finalize: (
      tx: ChannelsRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<RegistrationExecutionRegisteredResult>;
}
