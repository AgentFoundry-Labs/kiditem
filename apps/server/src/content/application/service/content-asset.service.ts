import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContentAssetItem } from '@kiditem/shared/product-content';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
  type ContentAssetLibraryWriteScope,
  type ContentAssetRow,
  type PersistedContentAssetRef,
  type RecordDetailPageGeneratedAssetsInput,
  type RecordDetailPageInputAssetsInput,
  type SyncGenerationImageUsagesInput,
} from '../port/out/repository/content-asset-library.repository.port';
import type {
  SalesProductContentAssetPort,
  SalesProductCurrentThumbnail,
  SalesProductRegistrationImages,
} from '../port/in/workspace/sales-product-content-asset.port';

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
  thumbnailGenerationId?: string | null;
}

export type { PersistedContentAssetRef };

@Injectable()
export class ContentAssetService implements SalesProductContentAssetPort {
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
    salesProductId: string;
  }): Promise<SalesProductRegistrationImages> {
    const media = await this.loadRegistrationMedia(input);
    return media.registrationImages;
  }

  /**
   * Reads the gallery and canonical representative together, then uses that
   * same representative object for both the registration gallery and detail
   * response. This avoids two competing current-selection reads during one
   * candidate-detail request.
   */
  async loadRegistrationMedia(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<{
    registrationImages: SalesProductRegistrationImages;
    currentThumbnail: SalesProductCurrentThumbnail | null;
  }> {
    const [rows, currentThumbnail] = await Promise.all([
      this.repository.listSalesProductAssets(input),
      this.repository.findSalesProductCurrentThumbnail(input),
    ]);
    const grouped: SalesProductRegistrationImages = { primary: [], thumbnail: [], detail: [] };
    for (const row of rows) {
      if (!isRegistrationRole(row.role)) continue;
      const url = typeof row.url === 'string' ? row.url.trim() : '';
      if (!url) continue;
      if (grouped[row.role].includes(url)) continue;
      grouped[row.role].push(url);
    }
    // 채택한 AI 후보는 자산 스캔에서 빠지므로(채택 전 후보는 몰로 가지 않는다) 현재 대표이미지로 보강한다.
    if (currentThumbnail && !grouped.thumbnail.includes(currentThumbnail.url)) {
      grouped.thumbnail.push(currentThumbnail.url);
    }
    return { registrationImages: grouped, currentThumbnail };
  }

  /**
   * The candidate's saved representative thumbnail, or `null`.
   *
   * This is the read side of `PATCH /ai/content-workspaces/:id/current-thumbnail`:
   * the workspace's `currentThumbnailAssetId`.
   */
  findCurrentThumbnail(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductCurrentThumbnail | null> {
    return this.repository.findSalesProductCurrentThumbnail(input);
  }

  /**
   * 배치판. 수집상품 목록이 후보마다 대표 썸네일을 되읽어야 하는데, 단건
   * 조회를 반복하면 페이지당 수십 번의 쿼리가 된다.
   */
  findCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnail>> {
    return this.repository.findSalesProductCurrentThumbnails(input);
  }

  /**
   * Replace the ordered `role='thumbnail'` gallery owned by one content workspace.
   *
   * This is the write side of `listRegistrationImages().thumbnail`. A candidate
   * with no `RegistrationTarget` has nowhere else to persist its preview list,
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

  /** 대표이미지 갤러리: 워크스페이스의 업로드 · AI 후보(`role='thumbnail'`), 새것부터. */
  async listThumbnailGallery(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<ContentAssetItem[]> {
    const rows = await this.repository.listWorkspaceThumbnailGallery(input);
    return rows.map(toContentAssetItem);
  }

  /** 채택: 그 워크스페이스의 자산 하나를 대표이미지(`currentThumbnailAssetId`)로. */
  async adoptCurrentThumbnail(input: {
    organizationId: string;
    contentWorkspaceId: string;
    assetId: string;
  }): Promise<ContentAssetItem> {
    return toContentAssetItem(await this.repository.setCurrentThumbnail(input));
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
        'Content asset is the representative image or is used by a current detail page.',
      );
    }
    return { ok: true };
  }

  recordDetailPageInputAssets(input: RecordDetailPageInputAssetsInput): Promise<PersistedContentAssetRef[]> {
    return this.repository.recordDetailPageInputAssets(input);
  }

  recordDetailPageInputAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.repository.recordDetailPageInputAssetsInScope(scope, input);
  }

  recordDetailPageGeneratedAssets(input: RecordDetailPageGeneratedAssetsInput): Promise<void> {
    return this.repository.recordDetailPageGeneratedAssets(input);
  }

  recordDetailPageGeneratedAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageGeneratedAssetsInput,
  ): Promise<void> {
    return this.repository.recordDetailPageGeneratedAssetsInScope(scope, input);
  }

  syncGenerationImageUsages(input: SyncGenerationImageUsagesInput): Promise<PersistedContentAssetRef[]> {
    return this.repository.syncGenerationImageUsages(input);
  }

  syncGenerationImageUsagesTx(
    scope: ContentAssetLibraryWriteScope,
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.repository.syncGenerationImageUsagesInScope(scope, input);
  }

  async listAssets(
    organizationId: string,
    query: ContentAssetListQuery = {},
  ): Promise<{ items: ContentAssetItem[]; total: number; page: number; limit: number }> {
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
      thumbnailGenerationId: query.thumbnailGenerationId ?? null,
    });
    return { items: rows.map(toContentAssetItem), total, page, limit };
  }
}

export function toContentAssetItem(row: ContentAssetRow): ContentAssetItem {
  return {
    id: row.id,
    contentWorkspaceId: row.contentWorkspaceId,
    source: row.source,
    role: row.role,
    url: row.url,
    label: row.label,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    thumbnailGenerationId: row.thumbnailGenerationId,
    isCurrentThumbnail: row.isCurrentThumbnail,
    createdAt: row.createdAt.toISOString(),
  };
}
