import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export const REGISTRATION_CONTENT_WORKSPACE_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_PORT',
);

export interface EnsureSalesProductContentWorkspaceInput {
  organizationId: string;
  salesProductId: string;
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

export interface AttachContentWorkspaceToListingInput {
  organizationId: string;
  salesProductId: string;
  listingId: string;
}

export interface FindSalesProductContentWorkspaceInput {
  organizationId: string;
  salesProductId: string;
}

export interface RegistrationContentWorkspacePort {
  /**
   * Read-only lookup of the active workspace a sales-product draft already owns.
   *
   * `ensureSalesProductWorkspace` is the write path and runs inside
   * registration. The draft screen only needs to know whether a workspace
   * exists, so it must not create one as a side effect of a GET.
   */
  findSalesProductWorkspaceId(
    input: FindSalesProductContentWorkspaceInput,
  ): Promise<string | null>;
  /**
   * Fills in what the operator left implicit (an artifact's current revision, a
   * generation's artifact) and adopts a plain thumbnail URL into managed
   * content. Channels owns the draft's image list, so it — not AI — is the
   * authority for whether a plain URL belongs to the draft; AI only enforces
   * that every id-bearing selection is owned by this workspace.
   */
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
    input: EnsureSalesProductContentWorkspaceInput,
  ): Promise<{ workspaceId: string }>;
  /**
   * Points the draft's own workspace at the listing registration produced.
   * There is one workspace per draft and it keeps its content, so registration
   * records the listing instead of cloning artifacts into a second workspace.
   */
  attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }>;
}
