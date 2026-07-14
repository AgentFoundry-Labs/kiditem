export const CONTENT_ARCHIVE_REPOSITORY_PORT = Symbol('CONTENT_ARCHIVE_REPOSITORY_PORT');

export type ContentArchiveContentType = 'detail_page' | 'image';

export interface ContentArchiveRepositoryQuery {
  contentType?: ContentArchiveContentType | null;
  status?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export interface ContentArchiveGenerationRow {
  id: string;
  generationGroupId: string;
  contentWorkspaceId: string;
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
  contentWorkspace: {
    id: string;
    ownerType: string;
    sourceCandidateId: string | null;
    channelListingId: string | null;
    displayName: string;
  };
  generationGroup: {
    id: string;
    title: string | null;
    groupType: string;
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

export interface ContentArchiveRepositoryPort {
  listWorkspaceGenerations(input: {
    organizationId: string;
    query: ContentArchiveRepositoryQuery;
  }): Promise<ContentArchiveGenerationRow[]>;
  findSourcingCandidate(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<{ id: string } | null>;
  listSourcingCandidateGenerations(input: {
    organizationId: string;
    candidateId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }>;
}
