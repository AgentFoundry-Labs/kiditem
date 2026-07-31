import type {
  CreateProductPreparationInput,
  ProductPreparationStatus,
  UpdateProductPreparationInput,
} from '@kiditem/shared/sourcing';
import type { MarketplaceSubmissionResult } from '@kiditem/shared/channel-listing';
import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';
import type { ProductPreparationJson } from '../../../../domain/product-preparation-payload';
import type { ProductPreparationProviderOutcome } from '../../../../domain/product-preparation-state';
import type {
  ResolvedRegistrationContentSelections,
  ValidateRegistrationContentSelectionsInput,
} from '../cross-domain/registration-content-workspace.port';

export const PRODUCT_PREPARATION_REPOSITORY_PORT = Symbol(
  'PRODUCT_PREPARATION_REPOSITORY_PORT',
);

export interface ProductPreparationDraftResult {
  preparationId: string;
  status: 'draft';
  sourceContentWorkspaceId?: string;
}

export interface ProductPreparationCancelledResult {
  preparationId: string;
  status: 'cancelled';
}

export interface ProductPreparationRegisteredResult {
  preparationId: string;
  status: 'registered';
  listingId: string;
}

export interface FrozenProductPreparationSubmission {
  executionId: string;
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
  displayName: string;
  status: ProductPreparationStatus;
  submissionKey: string;
  submissionPayloadJson: ProductPreparationJson;
  submissionPayloadHash: string;
  providerSubmissionId: string | null;
  registrationResult: ProductPreparationJson | null;
  providerOutcome: ProductPreparationProviderOutcome;
  submissionLeaseToken: string | null;
  isRetry: boolean;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
}

export type ProductPreparationClaimResult =
  | FrozenProductPreparationSubmission
  | ProductPreparationRegisteredResult;

export interface CreateOrGetActiveDraftInput {
  organizationId: string;
  sourceCandidateId: string;
  createdByUserId: string | null;
  input: CreateProductPreparationInput;
}

export interface PrepareExternalRegistrationExecutionInput {
  organizationId: string;
  sourceCandidateId: string;
  requestedByUserId: string | null;
  channelAccountId: string;
  displayName: string;
  registrationInput: Record<string, unknown>;
  idempotencyKey: string;
  providerAbsenceVerified?: boolean;
}

export interface ExternalRegistrationExecutionResult {
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
 * 제출되지 않은 채 닫힌 외부 등록. `ExternalRegistrationExecutionResult` 는
 * 살아 있는 실행(prepared~succeeded)만 표현하므로 종료 상태를 섞지 않는다.
 */
export interface ExternalRegistrationClosedResult {
  executionId: string;
  preparationId: string;
  status: 'failed';
  providerOutcome: 'definitive_failure';
}

export type ReplaceDraftInputCommand =
  | { kind: 'replace'; input: UpdateProductPreparationInput }
  | { kind: 'cancel' };

export interface ReplaceDraftInputRequest {
  organizationId: string;
  preparationId: string;
  userId: string | null;
  command: ReplaceDraftInputCommand;
}

export type ResolveProductPreparationSelections = (
  tx: SourcingRepositoryTransaction,
  input: ValidateRegistrationContentSelectionsInput,
) => Promise<ResolvedRegistrationContentSelections>;

export interface ProductPreparationRepositoryPort {
  cancelUnstartedExternalRegistrationIntents(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      cancelledAt: Date;
    },
  ): Promise<number>;

  assertCandidateTerminalTransitionAllowed(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;

  createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult>;

  prepareExternalExecution(
    input: PrepareExternalRegistrationExecutionInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ExternalRegistrationExecutionResult>;

  startExternalExecution(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<ExternalRegistrationExecutionResult>;

  getExternalExecution(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<ExternalRegistrationExecutionResult>;

  markExternalExecutionUnresolved(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ExternalRegistrationExecutionResult>;

  /**
   * 마켓에 아무것도 제출되지 않은 채 끝난 외부 등록을 확정 실패로 닫는다.
   *
   * 제출 여부를 모르는 실패는 `markExternalExecutionUnresolved` 로 `reconciling`
   * 에 남겨 중복 등록을 막아야 한다. 그런데 확장이 폼을 채우다 실패한 경우는
   * 제출 단계에 닿지도 못한 것이라 재시도가 안전하다. 이 둘을 구분하지 않으면
   * 폼 채움 실패 한 번에 그 수집상품이 영구히 등록 불가가 된다(라이브 사례).
   *
   * 공급자 식별자(등록상품ID·결과)가 하나라도 기록돼 있으면 호출자가 무엇을
   * 주장하든 거부한다. 기록된 성공을 실패로 되돌릴 수 있는 경로는 없다.
   */
  markExternalExecutionNotSubmitted(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ExternalRegistrationClosedResult>;

  replaceDraftInput(
    input: ReplaceDraftInputRequest,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | ProductPreparationCancelledResult>;

  claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationClaimResult>;

  loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenProductPreparationSubmission>;

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
  ): Promise<FrozenProductPreparationSubmission>;

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
      tx: SourcingRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<ProductPreparationRegisteredResult>;
}
