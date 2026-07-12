import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
  type ContentAssetLibraryWriteScope,
  type PersistedContentAssetRef,
} from '../port/out/repository/content-asset-library.repository.port';
export { groupUrlAssetKey } from '../../domain/content-asset-key';

export interface ContentAssetListQuery {
  page?: number;
  limit?: number;
  productId?: string | null;
  generationId?: string | null;
}

export type { PersistedContentAssetRef };

@Injectable()
export class ContentAssetService {
  constructor(
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly repository: ContentAssetLibraryRepositoryPort,
  ) {}

  async deleteAsset(
    organizationId: string,
    contentAssetId: string,
  ): Promise<{ ok: true }> {
    const result = await this.repository.deleteAsset({
      organizationId,
      contentAssetId,
      deletedAt: new Date(),
    });
    if (result.status === 'not_found') throw new NotFoundException('Content asset not found.');
    if (result.status === 'in_use') {
      throw new ConflictException(
        'Content asset is still used by an active generation or thumbnail selection.',
      );
    }
    return { ok: true };
  }

  recordDetailPageInputAssets(input: {
    organizationId: string;
    generationGroupId: string;
    createdByUserId: string | null;
    imageUrls: string[];
  }): Promise<PersistedContentAssetRef[]> {
    return this.repository.recordDetailPageInputAssets(input);
  }

  recordDetailPageGeneratedAssets(input: {
    organizationId: string;
    generationGroupId: string;
    contentGenerationId: string;
    processedImages: Record<string, string>;
  }): Promise<void> {
    return this.repository.recordDetailPageGeneratedAssets(input);
  }

  syncGenerationImageUsages(input: {
    organizationId: string;
    generationGroupId: string;
    contentGenerationId: string;
    createdByUserId: string | null;
    imageUrls: string[];
  }): Promise<PersistedContentAssetRef[]> {
    return this.repository.syncGenerationImageUsages(input);
  }

  syncGenerationImageUsagesTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      generationGroupId: string;
      contentGenerationId: string;
      createdByUserId: string | null;
      imageUrls: string[];
    },
  ): Promise<PersistedContentAssetRef[]> {
    return this.repository.syncGenerationImageUsagesInScope(scope, input);
  }

  async listAssets(
    organizationId: string,
    query: ContentAssetListQuery = {},
  ): Promise<{
    items: Array<{
      id: string;
      productId: string | null;
      generationGroupId: string;
      url: string;
      assetType: string;
      role: string | null;
      label: string | null;
      sortOrder: number;
      metadata: unknown;
      product: { id: string; code: string; name: string } | null;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Number.isFinite(query.page) && query.page && query.page > 0
      ? Math.floor(query.page)
      : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(query.limit) && query.limit ? Math.floor(query.limit) : 24),
    );
    const { total, rows } = await this.repository.listAssets({
      organizationId,
      page,
      limit,
      productId: query.productId ?? null,
      generationId: query.generationId ?? null,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        productId: row.generationGroup.targetMaster?.id ?? null,
        generationGroupId: row.generationGroupId,
        url: row.url,
        assetType: row.assetType,
        role: row.role,
        label: row.label,
        sortOrder: row.sortOrder,
        metadata: row.metadata,
        product: row.generationGroup.targetMaster,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }
}
