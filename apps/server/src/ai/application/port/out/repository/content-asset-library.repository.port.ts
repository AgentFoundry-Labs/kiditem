export const CONTENT_ASSET_LIBRARY_REPOSITORY_PORT = Symbol(
  'CONTENT_ASSET_LIBRARY_REPOSITORY_PORT',
);

export interface PersistedContentAssetRef {
  id: string;
  assetKey: string;
  url: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
}

export interface ContentAssetLibraryWriteScope {
  contentAsset: {
    createMany(args: any): Promise<unknown>;
    findMany(args: any): Promise<PersistedContentAssetRef[]>;
  };
  contentGenerationAssetUsage: {
    deleteMany(args: any): Promise<unknown>;
    createMany(args: any): Promise<unknown>;
  };
}

export interface ContentAssetListRepositoryInput {
  organizationId: string;
  page: number;
  limit: number;
  contentWorkspaceId: string | null;
  generationId: string | null;
}

export interface ContentAssetListRow {
  id: string;
  originGenerationGroupId: string | null;
  url: string;
  assetType: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  originGenerationGroup: {
    contentWorkspace: { id: string; displayName: string };
  } | null;
}

export interface RecordDetailPageInputAssetsInput {
  organizationId: string;
  generationGroupId: string;
  createdByUserId: string | null;
  imageUrls: string[];
}

export interface RecordDetailPageGeneratedAssetsInput {
  organizationId: string;
  generationGroupId: string;
  contentGenerationId: string;
  processedImages: Record<string, string>;
}

export interface SyncGenerationImageUsagesInput {
  organizationId: string;
  generationGroupId: string;
  contentGenerationId: string;
  createdByUserId: string | null;
  imageUrls: string[];
}

/**
 * A role-tagged asset reachable from a sourcing candidate.
 *
 * Reachability is `ContentAsset.originGenerationGroupId -> ContentGenerationGroup
 * -> ContentWorkspace.sourceCandidateId`. The `ContentGeneration.sourceCandidateId`
 * route does NOT work for `workspace_assets` groups: those groups hold no
 * generations at all, so joining through `ContentGeneration` drops every
 * `primary`/`thumbnail`/`detail`/`option` asset.
 */
export interface CandidateContentAssetRow {
  role: string | null;
  url: string;
  sortOrder: number;
}

/**
 * Replace the workspace-owned `role='thumbnail'` gallery in one shot.
 *
 * The gallery is the ordered "썸네일 미리보기 이미지" set. It is the only write
 * path a candidate without a `ProductPreparation` has, so it must land on
 * `ContentAsset.role='thumbnail'` — that is the set
 * `listCandidateAssets`/`listRegistrationImages` read back into Wing
 * `additionalImageUrls`.
 */
export interface ReplaceWorkspaceThumbnailGalleryInput {
  organizationId: string;
  contentWorkspaceId: string;
  createdByUserId: string | null;
  urls: string[];
}

/**
 * The workspace-owned current thumbnail selection for one sourcing candidate.
 *
 * This is the workspace-side twin of `ProductPreparation.selectedThumbnailUrl`.
 * A candidate with no `ProductPreparation` can only record its representative
 * thumbnail here (`ContentWorkspace.currentThumbnailSelectionId`), so without
 * reading it back the saved selection is invisible after a reload.
 */
export interface CandidateCurrentThumbnailRow {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
}

export interface ContentAssetLibraryRepositoryPort {
  deleteAsset(input: {
    organizationId: string;
    contentAssetId: string;
    deletedAt: Date;
  }): Promise<{ status: 'deleted' | 'in_use' | 'not_found' }>;
  recordDetailPageInputAssets(
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]>;
  recordDetailPageInputAssetsInScope(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]>;
  recordDetailPageGeneratedAssets(input: RecordDetailPageGeneratedAssetsInput): Promise<void>;
  recordDetailPageGeneratedAssetsInScope(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageGeneratedAssetsInput,
  ): Promise<void>;
  syncGenerationImageUsages(
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]>;
  syncGenerationImageUsagesInScope(
    scope: ContentAssetLibraryWriteScope,
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]>;
  listAssets(input: ContentAssetListRepositoryInput): Promise<{
    total: number;
    rows: ContentAssetListRow[];
  }>;
  listCandidateAssets(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateContentAssetRow[]>;
  findCandidateCurrentThumbnail(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateCurrentThumbnailRow | null>;
  /**
   * 배치판. 목록 화면은 후보마다 단건 조회를 돌리면 N+1 이 되므로 반드시
   * 이쪽을 쓴다. 선택이 없는 후보는 맵에서 빠진다(빈 값을 만들지 않는다).
   */
  findCandidateCurrentThumbnails(input: {
    organizationId: string;
    sourceCandidateIds: string[];
  }): Promise<Map<string, CandidateCurrentThumbnailRow>>;
  replaceWorkspaceThumbnailGallery(
    input: ReplaceWorkspaceThumbnailGalleryInput,
  ): Promise<{ urls: string[] }>;
}
