export const DETAIL_PAGE_QUERY_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_QUERY_REPOSITORY_PORT',
);

export interface DetailPageGenerationSnapshot {
  id: string;
  sourceCandidateId: string | null;
  contentWorkspaceId: string;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  generatedTitle: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface DetailPageListRepositoryInput {
  organizationId: string;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export interface DetailPageDuplicateRevisionSnapshot {
  id: string;
  html: string;
  assetUrlMap: unknown;
  imageUrls: unknown;
}

export interface DetailPageDuplicateSourceSnapshot {
  id: string;
  generationGroupId: string;
  contentWorkspaceId: string;
  sourceCandidateId: string | null;
  detailPageArtifactId: string | null;
  contentType: string;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  generatedTitle: string | null;
  generatedDescription: string | null;
  generatedCopy: string | null;
  editedHtml: string | null;
  editedHtmlSavedAt: Date | null;
  status: string;
  triggeredByUserId: string | null;
  detailPageArtifact: {
    id: string;
    title: string | null;
    currentRevision: DetailPageDuplicateRevisionSnapshot | null;
  } | null;
}

export interface DetailPageEditedHtmlSnapshot {
  id: string;
  editedHtml: string | null;
  editedHtmlSavedAt: Date | null;
  detailPageArtifact: {
    isDeleted: boolean;
    currentRevision: {
      html: string;
      createdAt: Date;
    } | null;
  } | null;
}

export interface DetailPageQueryRepositoryPort {
  list(input: DetailPageListRepositoryInput): Promise<DetailPageGenerationSnapshot[]>;
  findById(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageGenerationSnapshot | null>;
  existsActive(input: {
    id: string;
    organizationId: string;
  }): Promise<boolean>;
  markDeleted(input: {
    id: string;
    organizationId: string;
    deletedAt: Date;
  }): Promise<void>;
  renameVersion(input: {
    id: string;
    organizationId: string;
    title: string;
  }): Promise<boolean>;
  findDuplicateSource(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageDuplicateSourceSnapshot | null>;
  duplicateVersion(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    source: DetailPageDuplicateSourceSnapshot;
    duplicateTitle: string;
  }): Promise<DetailPageGenerationSnapshot>;
  saveEditedHtmlRevision(input: {
    organizationId: string;
    contentGenerationId: string;
    html: string;
    assetUrlMap: Record<string, string>;
    imageUrls: string[];
    savedAt: Date;
  }): Promise<{ html: string; createdAt: Date }>;
  getEditedHtml(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageEditedHtmlSnapshot | null>;
}
