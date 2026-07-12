import type {
  CreateProductPreparationInput,
  ProductPreparationStatus,
  UpdateProductPreparationInput,
} from '@kiditem/shared/sourcing';
import type { MarketplaceSubmissionResult } from '@kiditem/shared/channel-listing';
import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';
import type { ProductPreparationJson } from '../../../../domain/product-preparation-payload';

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

export type ReplaceDraftInputCommand =
  | { kind: 'replace'; input: UpdateProductPreparationInput }
  | { kind: 'cancel' };

export interface ReplaceDraftInputRequest {
  organizationId: string;
  preparationId: string;
  userId: string | null;
  command: ReplaceDraftInputCommand;
}

export interface ProductPreparationRepositoryPort {
  createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
  ): Promise<ProductPreparationDraftResult>;

  replaceDraftInput(
    input: ReplaceDraftInputRequest,
  ): Promise<ProductPreparationDraftResult | ProductPreparationCancelledResult>;

  claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<ProductPreparationClaimResult>;

  loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenProductPreparationSubmission>;

  recordProviderResult(
    organizationId: string,
    preparationId: string,
    result: MarketplaceSubmissionResult,
  ): Promise<FrozenProductPreparationSubmission>;

  markFailed(input: {
    organizationId: string;
    preparationId: string;
    error: string;
  }): Promise<{ preparationId: string; status: 'failed' }>;

  finalizeRegistered(
    organizationId: string,
    preparationId: string,
    finalize: (
      tx: SourcingRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<ProductPreparationRegisteredResult>;
}
