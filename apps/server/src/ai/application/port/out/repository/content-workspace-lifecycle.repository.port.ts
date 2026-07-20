export const CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT = Symbol(
  'CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT',
);

export interface EnsureContentWorkspaceInput {
  organizationId: string;
  ownerType: 'sourcing_candidate' | 'channel_listing' | 'direct_detail_page';
  sourceCandidateId: string | null;
  channelListingId: string | null;
  originWorkspaceId: string | null;
  displayName: string;
  normalizedTitle: string;
  createdByUserId: string | null;
}

export interface ContentWorkspaceIdentity {
  id: string;
  displayName: string;
  normalizedTitle: string;
}

export interface ContentWorkspaceArtifactSnapshot {
  id: string;
  currentRevisionId: string | null;
  title: string | null;
  sourceContentGenerationId: string | null;
}

export interface ContentWorkspaceGenerationSnapshot {
  id: string;
  contentType: string;
  status: string;
  generatedTitle: string | null;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  detailPageArtifactId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentWorkspaceSnapshot {
  id: string;
  ownerType: string;
  sourceCandidateId: string | null;
  channelListingId: string | null;
  originWorkspaceId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentThumbnailSelectionId: string | null;
  currentThumbnailSelection: {
    id: string;
    contentAsset: { id: string; url: string };
  } | null;
  currentDetailPageArtifact: ContentWorkspaceArtifactSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { contentGenerations: number };
  contentGenerations?: ContentWorkspaceGenerationSnapshot[];
}

export interface ContentWorkspaceListInput {
  organizationId: string;
  status: string;
  normalizedTitle: string | null;
  page: number;
  limit: number;
}

export interface SelectableDetailPageGenerationSnapshot {
  id: string;
  detailPageArtifactId: string | null;
  detailPageArtifact: {
    currentRevisionId: string | null;
  } | null;
}

export interface ContentWorkspaceLifecycleRepositoryPort {
  ensureActiveWorkspace(input: EnsureContentWorkspaceInput): Promise<ContentWorkspaceIdentity>;
  findDuplicateByNormalizedTitle(input: {
    organizationId: string;
    normalizedTitle: string;
  }): Promise<ContentWorkspaceSnapshot | null>;
  getById(input: {
    organizationId: string;
    workspaceId: string;
  }): Promise<ContentWorkspaceSnapshot | null>;
  listActive(input: ContentWorkspaceListInput): Promise<{
    total: number;
    rows: ContentWorkspaceSnapshot[];
  }>;
  archive(input: {
    organizationId: string;
    workspaceId: string;
    archivedAt: Date;
  }): Promise<number>;
  findSelectableDetailPageGeneration(input: {
    organizationId: string;
    workspaceId: string;
    contentGenerationId: string;
  }): Promise<SelectableDetailPageGenerationSnapshot | null>;
  selectCurrentDetailPage(input: {
    organizationId: string;
    workspaceId: string;
    detailPageArtifactId: string;
    detailPageRevisionId: string | null;
  }): Promise<number>;
}
