import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  AttachContentWorkspaceToListingInput,
  EnsureSalesProductContentWorkspaceInput,
  FindSalesProductContentWorkspaceInput,
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
  findSalesProductWorkspaceId(
    input: FindSalesProductContentWorkspaceInput,
  ): Promise<string | null>;
  resolveSourceSelections(
    transaction: OwnerTransaction,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections>;
  validateSourceSelections(
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void>;
  ensureSalesProductWorkspace(
    transaction: OwnerTransaction,
    input: EnsureSalesProductContentWorkspaceInput &
      RegistrationContentWorkspaceOwnerInput,
  ): Promise<{ workspaceId: string }>;
  attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }>;
}
