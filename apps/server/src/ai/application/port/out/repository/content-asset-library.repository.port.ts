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

export interface ContentAssetLibraryRepositoryPort {
  deleteAsset(input: {
    organizationId: string;
    contentAssetId: string;
    deletedAt: Date;
  }): Promise<{ status: 'deleted' | 'in_use' | 'not_found' }>;
  recordDetailPageInputAssets(
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]>;
  recordDetailPageGeneratedAssets(input: RecordDetailPageGeneratedAssetsInput): Promise<void>;
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
}
