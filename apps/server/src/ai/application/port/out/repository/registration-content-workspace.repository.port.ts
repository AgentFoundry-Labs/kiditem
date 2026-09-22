import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  BranchRegistrationWorkspaceToListingInput,
  EnsureRegistrationCandidateWorkspaceInput,
  FindCandidateContentWorkspaceInput,
  RegistrationContentSelectionInput,
  ResolvedRegistrationContentSelections,
} from '../../in/workspace/registration-content-workspace.port';

export const REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT',
);

export interface RegistrationContentWorkspaceOwnerInput {
  displayName: string;
  normalizedTitle: string;
}

export interface RegistrationContentWorkspaceRepositoryPort {
  findCandidateWorkspaceId(
    input: FindCandidateContentWorkspaceInput,
  ): Promise<string | null>;
  resolveSourceSelections(
    transaction: OwnerTransaction,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections>;
  validateSourceSelections(
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void>;
  ensureCandidateWorkspace(
    transaction: OwnerTransaction,
    input: EnsureRegistrationCandidateWorkspaceInput &
      RegistrationContentWorkspaceOwnerInput,
  ): Promise<{ workspaceId: string }>;
  branchToListing(
    transaction: OwnerTransaction,
    input: BranchRegistrationWorkspaceToListingInput &
      RegistrationContentWorkspaceOwnerInput,
  ): Promise<{ workspaceId: string }>;
}
