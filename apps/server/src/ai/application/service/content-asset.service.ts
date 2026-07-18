import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
  type ContentAssetLibraryWriteScope,
  type PersistedContentAssetRef,
} from '../port/out/repository/content-asset-library.repository.port';
import type {
  CandidateContentAssetPort,
  CandidateRegistrationImages,
} from '../port/in/workspace/candidate-content-asset.port';
export { groupUrlAssetKey } from '../../domain/content-asset-key';

/** Roles that may be pushed into a channel registration form, in form order. */
const REGISTRATION_ROLES = ['primary', 'thumbnail', 'detail'] as const;
type RegistrationRole = (typeof REGISTRATION_ROLES)[number];

const isRegistrationRole = (role: string | null): role is RegistrationRole =>
  role !== null && (REGISTRATION_ROLES as readonly string[]).includes(role);

export interface ContentAssetListQuery {
  page?: number;
  limit?: number;
  contentWorkspaceId?: string | null;
  generationId?: string | null;
}

export type { PersistedContentAssetRef };

@Injectable()
export class ContentAssetService implements CandidateContentAssetPort {
  constructor(
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly repository: ContentAssetLibraryRepositoryPort,
  ) {}

  /**
   * Role-split registration images for one candidate.
   *
   * Anything that is not `primary`/`thumbnail`/`detail` is dropped — notably
   * `source` (raw scrape originals, wrong spec) and `option` (per-SKU images,
   * not wired into any registration form yet).
   */
  async listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages> {
    const rows = await this.repository.listCandidateAssets(input);
    const grouped: CandidateRegistrationImages = { primary: [], thumbnail: [], detail: [] };
    for (const row of rows) {
      if (!isRegistrationRole(row.role)) continue;
      const url = typeof row.url === 'string' ? row.url.trim() : '';
      if (!url) continue;
      if (grouped[row.role].includes(url)) continue;
      grouped[row.role].push(url);
    }
    return grouped;
  }

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
      contentWorkspaceId: string | null;
      originGenerationGroupId: string | null;
      url: string;
      assetType: string;
      role: string | null;
      label: string | null;
      sortOrder: number;
      metadata: unknown;
      workspace: { id: string; displayName: string } | null;
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
      contentWorkspaceId: query.contentWorkspaceId ?? null,
      generationId: query.generationId ?? null,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        contentWorkspaceId: row.originGenerationGroup?.contentWorkspace.id ?? null,
        originGenerationGroupId: row.originGenerationGroupId,
        url: row.url,
        assetType: row.assetType,
        role: row.role,
        label: row.label,
        sortOrder: row.sortOrder,
        metadata: row.metadata,
        workspace: row.originGenerationGroup?.contentWorkspace ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }
}
