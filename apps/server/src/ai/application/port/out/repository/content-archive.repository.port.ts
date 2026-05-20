export const CONTENT_ARCHIVE_REPOSITORY_PORT = Symbol('CONTENT_ARCHIVE_REPOSITORY_PORT');

export type ContentArchiveContentType = 'detail_page' | 'image';
export type ContentArchiveLinkState = 'linked' | 'unlinked';

export interface ContentArchiveRepositoryQuery {
  contentType?: ContentArchiveContentType | null;
  linkState?: ContentArchiveLinkState | null;
  status?: string | null;
  sourceCandidateId?: string | null;
  productId?: string | null;
}

export interface ContentArchiveProductRow {
  id: string;
  code: string;
  name: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
}

export interface ContentArchiveGroupRow {
  id: string;
  title: string | null;
  groupType: string;
}

export interface ContentArchiveGenerationRow {
  id: string;
  generationGroupId: string;
  contentType: string;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  generatedTitle: string | null;
  sourceCandidateId: string | null;
  detailPageArtifactId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  generationGroup: {
    id: string;
    title: string;
    groupType: string;
    targetMasterId: string | null;
    targetMaster: ContentArchiveProductRow | null;
  };
  assetUsages: Array<{
    contentAsset: {
      id: string;
      url: string;
      role: string | null;
      label: string | null;
      sortOrder: number;
      createdAt: Date;
    };
  }>;
  sources: Array<{
    id: string;
    sourceType: string;
    sourceCandidateId: string | null;
    sourceContentGenerationId: string | null;
    contentAssetId: string | null;
    label: string | null;
  }>;
  detailPageArtifact: {
    id: string;
    sourceCandidateId: string | null;
    isDeleted: boolean;
    currentRevisionId: string | null;
    currentRevision: {
      id: string;
      revisionType: string;
      createdAt: Date;
    } | null;
    revisions: Array<{
      id: string;
      revisionType: string;
      createdAt: Date;
    }>;
  } | null;
}

export type ContentArchiveDeleteResult =
  | { status: 'deleted'; deletedGenerations: number; deletedAssets: number }
  | { status: 'workspace_not_found' };

export type ContentArchiveDeleteGroupResult =
  | { status: 'deleted'; deletedGenerations: number; deletedAssets: number }
  | { status: 'group_not_found' }
  | { status: 'workspace_not_found' };

export interface ContentArchiveRepositoryPort {
  listWorkspaceGenerations(input: {
    organizationId: string;
    query: ContentArchiveRepositoryQuery;
  }): Promise<ContentArchiveGenerationRow[]>;
  findProduct(input: {
    organizationId: string;
    productId: string;
  }): Promise<ContentArchiveProductRow | null>;
  listProductWorkspaceGenerations(input: {
    organizationId: string;
    productId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }>;
  findGroup(input: {
    organizationId: string;
    groupId: string;
  }): Promise<ContentArchiveGroupRow | null>;
  listGroupWorkspaceGenerations(input: {
    organizationId: string;
    groupId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }>;
  deleteProductWorkspace(input: {
    organizationId: string;
    productId: string;
  }): Promise<ContentArchiveDeleteResult>;
  deleteGroupWorkspace(input: {
    organizationId: string;
    groupId: string;
  }): Promise<ContentArchiveDeleteGroupResult>;
  findSourcingCandidate(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<{ id: string; promotedMasterId: string | null } | null>;
  listSourcingCandidateGenerations(input: {
    organizationId: string;
    candidateId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }>;
  listPromotedProductGenerations(input: {
    organizationId: string;
    productId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }>;
}
