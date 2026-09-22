export const DETAIL_PAGE_QUERY_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_QUERY_REPOSITORY_PORT',
);

export interface DetailPageGenerationSnapshot {
  id: string;
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

/**
 * 후보(sourcing candidate)에 저장된 "현재 상세페이지" HTML.
 *
 * 경로: content_workspaces(source_candidate_id)
 *   -> current_detail_page_revision_id
 *   -> (없으면) detail_page_artifacts.current_revision_id
 */
export interface CandidateDetailPageHtmlSnapshot {
  revisionId: string;
  artifactId: string;
  html: string;
  createdAt: Date;
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
  /**
   * 다른 데서 가져온 상세페이지를 우리 상세페이지 한 판으로 만든다. AI 가 만든 것과 같은 자리
   * (`ContentGeneration`)에 들어가되 출처가 `uploaded` 이고, 돌릴 작업이 없으니 바로 완료다.
   */
  createUploadedVersion(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    contentWorkspaceId: string;
    title: string;
    imageUrls: readonly string[];
  }): Promise<DetailPageGenerationSnapshot>;
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
  }): Promise<{
    revisionId: string;
    artifactId: string;
    html: string;
    createdAt: Date;
  }>;
  getEditedHtml(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageEditedHtmlSnapshot | null>;
  findWorkspaceCurrentDetailPageHtml(input: {
    contentWorkspaceId: string;
    organizationId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null>;
  findDetailPageRevisionHtml(input: {
    organizationId: string;
    revisionId: string;
    artifactId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null>;
}
