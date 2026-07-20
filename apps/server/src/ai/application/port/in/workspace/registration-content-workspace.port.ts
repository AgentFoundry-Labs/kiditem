export const REGISTRATION_CONTENT_WORKSPACE_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_PORT',
);

export interface EnsureRegistrationCandidateWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
  displayName: string;
  createdByUserId: string | null;
}

export interface RegistrationContentSelectionInput {
  organizationId: string;
  sourceWorkspaceId: string;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
}

export type ResolvedRegistrationContentSelections = Pick<
  RegistrationContentSelectionInput,
  | 'selectedThumbnailUrl'
  | 'selectedThumbnailGenerationId'
  | 'selectedThumbnailGenerationCandidateId'
  | 'selectedDetailPageArtifactId'
  | 'selectedDetailPageRevisionId'
  | 'selectedDetailPageGenerationId'
>;

export interface BranchRegistrationWorkspaceToListingInput
  extends RegistrationContentSelectionInput {
  listingId: string;
  displayName: string;
  createdByUserId: string | null;
}

export interface FindCandidateContentWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
}

export interface RegistrationContentWorkspacePort {
  /**
   * Read-only lookup of the active workspace a candidate already owns.
   *
   * `ensureCandidateWorkspace` is the write path and runs inside registration.
   * The candidate workspace screen only needs to know whether a workspace
   * exists, so it must not create one as a side effect of a GET.
   */
  findCandidateWorkspaceId(
    input: FindCandidateContentWorkspaceInput,
  ): Promise<string | null>;
  resolveSourceSelections(
    transaction: object,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections>;
  validateSourceSelections(
    transaction: object | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void>;
  ensureCandidateWorkspace(
    transaction: object,
    input: EnsureRegistrationCandidateWorkspaceInput,
  ): Promise<{ workspaceId: string }>;
  branchToListing(
    transaction: object,
    input: BranchRegistrationWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }>;
}
