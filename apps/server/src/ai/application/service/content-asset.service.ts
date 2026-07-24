import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
  type ContentAssetLibraryWriteScope,
  type PersistedContentAssetRef,
} from '../port/out/repository/content-asset-library.repository.port';
import type {
  CandidateContentAssetPort,
  CandidateCurrentThumbnail,
  CandidateRegistrationImages,
} from '../port/in/workspace/candidate-content-asset.port';
export { groupUrlAssetKey } from '../../domain/content-asset-key';

/** Roles that may be pushed into a channel registration form, in form order. */
const REGISTRATION_ROLES = ['primary', 'thumbnail', 'detail'] as const;
type RegistrationRole = (typeof REGISTRATION_ROLES)[number];

/** Wing 추가이미지는 최대 9장이지만, 대표 제외 여유를 두고 상한을 잡는다. */
const MAX_WORKSPACE_THUMBNAIL_GALLERY = 20;

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
    // 갤러리 스캔(자산 그룹 소유 기준)은 중복 상품끼리 재사용된 썸네일을 놓친다.
    // 워크스페이스의 현재 선택 포인터(워크스페이스 id 기준)로 그 재사용분을 보강한다.
    // 순수 갤러리 저장분은 위에서 이미 채웠으므로 여기서는 빠진 것만 합친다.
    const selectedThumbnailUrls = await this.repository.listCandidateSelectedThumbnailUrls(input);
    for (const url of selectedThumbnailUrls) {
      if (!url || grouped.thumbnail.includes(url)) continue;
      grouped.thumbnail.push(url);
    }
    return grouped;
  }

  /**
   * The candidate's saved representative thumbnail, or `null`.
   *
   * This is the read side of `PATCH /ai/content-workspaces/:id/current-thumbnail`
   * for a candidate that has no `ProductPreparation`: the selection lives on the
   * workspace, so nothing else can restore it after a reload.
   */
  findCurrentThumbnail(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateCurrentThumbnail | null> {
    return this.repository.findCandidateCurrentThumbnail(input);
  }

  /**
   * 배치판. 수집상품 목록이 후보마다 대표 썸네일을 되읽어야 하는데, 단건
   * 조회를 반복하면 페이지당 수십 번의 쿼리가 된다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    sourceCandidateIds: string[];
  }): Promise<Map<string, CandidateCurrentThumbnail>> {
    return this.repository.findCandidateCurrentThumbnails(input);
  }

  /**
   * Replace the ordered `role='thumbnail'` gallery owned by one content workspace.
   *
   * This is the write side of `listRegistrationImages().thumbnail`. A candidate
   * with no `ProductPreparation` has nowhere else to persist its preview list,
   * so without this the list was dropped and Wing `additionalImageUrls` stayed
   * empty.
   */
  async replaceWorkspaceThumbnailGallery(input: {
    organizationId: string;
    contentWorkspaceId: string;
    createdByUserId: string | null;
    thumbnailUrls: string[];
  }): Promise<{ thumbnailUrls: string[] }> {
    const urls: string[] = [];
    for (const raw of input.thumbnailUrls) {
      const url = typeof raw === 'string' ? raw.trim() : '';
      if (!url || urls.includes(url)) continue;
      urls.push(url);
    }
    if (urls.length > MAX_WORKSPACE_THUMBNAIL_GALLERY) {
      throw new BadRequestException(
        `Thumbnail gallery accepts at most ${MAX_WORKSPACE_THUMBNAIL_GALLERY} images.`,
      );
    }
    const result = await this.repository.replaceWorkspaceThumbnailGallery({
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      createdByUserId: input.createdByUserId,
      urls,
    });
    return { thumbnailUrls: result.urls };
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

  recordDetailPageInputAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      generationGroupId: string;
      createdByUserId: string | null;
      imageUrls: string[];
    },
  ): Promise<PersistedContentAssetRef[]> {
    return this.repository.recordDetailPageInputAssetsInScope(scope, input);
  }

  recordDetailPageGeneratedAssets(input: {
    organizationId: string;
    generationGroupId: string;
    contentGenerationId: string;
    processedImages: Record<string, string>;
  }): Promise<void> {
    return this.repository.recordDetailPageGeneratedAssets(input);
  }

  recordDetailPageGeneratedAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      generationGroupId: string;
      contentGenerationId: string;
      processedImages: Record<string, string>;
    },
  ): Promise<void> {
    return this.repository.recordDetailPageGeneratedAssetsInScope(scope, input);
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
