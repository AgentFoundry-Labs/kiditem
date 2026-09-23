import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  AttachContentWorkspaceToListingInput,
  EnsureSalesProductContentWorkspaceInput,
  FindSalesProductContentWorkspaceInput,
  ImportDetailPageInput,
  ImportDetailPageResult,
  RegistrableDetailPage,
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
  readRegistrableDetailPage(input: {
    organizationId: string;
    salesProductId: string;
    revisionId: string | null;
  }): Promise<RegistrableDetailPage | null>;
  readRegistrableDetailPages(input: {
    organizationId: string;
    requests: ReadonlyArray<{ salesProductId: string; revisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailPage>>;
  importDetailPage(
    transaction: OwnerTransaction,
    input: ImportDetailPageInput & { imageUrls: readonly string[] },
  ): Promise<ImportDetailPageResult>;
  attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }>;
}
