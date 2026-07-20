import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';

export const REGISTRATION_CONTENT_WORKSPACE_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_PORT',
);

export interface EnsureCandidateContentWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
  displayName: string;
  createdByUserId: string | null;
}

export interface BranchRegistrationContentWorkspaceInput {
  organizationId: string;
  sourceWorkspaceId: string;
  listingId: string;
  displayName: string;
  createdByUserId: string | null;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
}

export type ValidateRegistrationContentSelectionsInput = Omit<
  BranchRegistrationContentWorkspaceInput,
  'listingId' | 'displayName' | 'createdByUserId'
>;

export type ResolvedRegistrationContentSelections = Pick<
  ValidateRegistrationContentSelectionsInput,
  | 'selectedThumbnailUrl'
  | 'selectedThumbnailGenerationId'
  | 'selectedThumbnailGenerationCandidateId'
  | 'selectedDetailPageArtifactId'
  | 'selectedDetailPageRevisionId'
  | 'selectedDetailPageGenerationId'
>;

export interface FindCandidateContentWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
}

export interface RegistrationContentWorkspacePort {
  /**
   * Read-only lookup used by the candidate workspace detail response. Returns
   * `null` when the candidate has no workspace yet — callers must not treat
   * that as a reason to create one on a read path.
   */
  findCandidateWorkspaceId(
    input: FindCandidateContentWorkspaceInput,
  ): Promise<string | null>;
  resolveSourceSelections(
    tx: SourcingRepositoryTransaction,
    input: ValidateRegistrationContentSelectionsInput,
  ): Promise<ResolvedRegistrationContentSelections>;
  validateSourceSelections(
    input: ValidateRegistrationContentSelectionsInput,
  ): Promise<void>;
  ensureCandidateWorkspace(
    tx: SourcingRepositoryTransaction,
    input: EnsureCandidateContentWorkspaceInput,
  ): Promise<string>;
  branchToListing(
    tx: SourcingRepositoryTransaction,
    input: BranchRegistrationContentWorkspaceInput,
  ): Promise<{ workspaceId: string }>;
}
