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
  productId: string | null;
  generationId: string | null;
}

export interface ContentAssetListRow {
  id: string;
  generationGroupId: string;
  url: string;
  assetType: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  generationGroup: {
    targetMaster: { id: string; code: string; name: string } | null;
  };
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

export interface ContentAssetLibraryRepositoryPort {
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
}
