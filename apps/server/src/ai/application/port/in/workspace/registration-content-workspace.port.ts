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

export interface BranchRegistrationWorkspaceToListingInput
  extends RegistrationContentSelectionInput {
  listingId: string;
  displayName: string;
  createdByUserId: string | null;
}

export interface RegistrationContentWorkspacePort {
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
