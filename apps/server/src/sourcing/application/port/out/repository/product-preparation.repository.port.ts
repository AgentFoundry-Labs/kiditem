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
