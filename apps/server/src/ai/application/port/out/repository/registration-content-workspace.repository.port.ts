import type {
  BranchRegistrationWorkspaceToListingInput,
  EnsureRegistrationCandidateWorkspaceInput,
  RegistrationContentSelectionInput,
} from '../../in/workspace/registration-content-workspace.port';

export const REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT',
);

export interface RegistrationContentWorkspaceOwnerInput {
  displayName: string;
  normalizedTitle: string;
}

export interface RegistrationContentWorkspaceRepositoryPort {
  validateSourceSelections(
    transaction: object | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void>;
  ensureCandidateWorkspace(
    transaction: object,
    input: EnsureRegistrationCandidateWorkspaceInput &
      RegistrationContentWorkspaceOwnerInput,
  ): Promise<{ workspaceId: string }>;
  branchToListing(
    transaction: object,
    input: BranchRegistrationWorkspaceToListingInput &
      RegistrationContentWorkspaceOwnerInput,
  ): Promise<{ workspaceId: string }>;
}
