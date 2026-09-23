import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ContentAssetSource } from '@kiditem/shared/product-content';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  hashContentAssetUrl,
  workspaceImageAssetKey,
  workspaceThumbnailAssetKey,
} from '../../../domain/content-asset-key';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';
import type {
  ContentAssetLibraryRepositoryPort,
  ContentAssetLibraryWriteScope,
  ContentAssetListRepositoryInput,
  ContentAssetRow,
  PersistedContentAssetRef,
  RecordDetailPageGeneratedAssetsInput,
  RecordDetailPageInputAssetsInput,
  ReplaceWorkspaceThumbnailGalleryInput,
  SalesProductContentAssetRow,
  SalesProductCurrentThumbnailRow,
  SyncGenerationImageUsagesInput,
} from '../../../application/port/out/repository/content-asset-library.repository.port';

const assetRowSelect = {
  id: true,
  contentWorkspaceId: true,
  source: true,
  thumbnailGenerationId: true,
  url: true,
  assetType: true,
  role: true,
  label: true,
  sortOrder: true,
  width: true,
  height: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  contentWorkspace: { select: { currentThumbnailAssetId: true } },
} satisfies Prisma.ContentAssetSelect;

type AssetRecord = Prisma.ContentAssetGetPayload<{ select: typeof assetRowSelect }>;

@Injectable()
export class ContentAssetLibraryRepositoryAdapter implements ContentAssetLibraryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage?: ImageStoragePort,
  ) {}

  async deleteAsset(input: {
    organizationId: string;
    contentAssetId: string;
    deletedAt: Date;
  }): Promise<{ status: 'deleted' | 'in_use' | 'not_found' }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; url: string; content_workspace_id: string }>>(Prisma.sql`
        SELECT id, url, content_workspace_id
        FROM content_assets
        WHERE id = ${input.contentAssetId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND is_deleted = false
        FOR UPDATE
      `);
      const asset = locked[0];
      if (!asset) return { status: 'not_found' as const };
      const inUse = await tx.$queryRaw<Array<{ in_use: boolean }>>(Prisma.sql`
        SELECT (
          EXISTS (
            SELECT 1 FROM content_workspaces w
            WHERE w.organization_id = ${input.organizationId}::uuid
              AND w.current_thumbnail_asset_id = ${asset.id}::uuid
              AND w.is_deleted = false
          )
          OR EXISTS (
            SELECT 1
            FROM detail_pages p
            JOIN detail_page_revisions r
              ON r.id = p.current_revision_id AND r.organization_id = p.organization_id
            WHERE p.organization_id = ${input.organizationId}::uuid
              AND p.content_workspace_id = ${asset.content_workspace_id}::uuid
              AND p.is_deleted = false
              AND r.image_urls @> jsonb_build_array(${asset.url}::text)
          )
        ) AS in_use
      `);
      if (inUse[0]?.in_use) return { status: 'in_use' as const };
      const deleted = await tx.contentAsset.updateMany({
        where: { id: asset.id, organizationId: input.organizationId, isDeleted: false },
        data: { isDeleted: true, deletedAt: input.deletedAt },
      });
      return { status: deleted.count === 1 ? 'deleted' as const : 'not_found' as const };
    });
  }

  recordDetailPageInputAssets(
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.prisma.$transaction((tx) => this.recordDetailPageInputAssetsInScope(tx, input));
  }

  recordDetailPageInputAssetsInScope(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.upsertWorkspaceImageAssetsTx(scope, {
      organizationId: input.organizationId,
      contentWorkspaceId: requireWorkspaceId(input.contentWorkspaceId),
      createdByUserId: input.createdByUserId,
      imageUrls: input.imageUrls,
      role: 'detail_source',
    });
  }

  async recordDetailPageGeneratedAssets(input: RecordDetailPageGeneratedAssetsInput): Promise<void> {
    return this.prisma.$transaction((tx) => this.recordDetailPageGeneratedAssetsInScope(tx, input));
  }

  async recordDetailPageGeneratedAssetsInScope(
    scope: ContentAssetLibraryWriteScope,
    input: RecordDetailPageGeneratedAssetsInput,
  ): Promise<void> {
    const entries = Object.entries(input.processedImages)
      .filter((entry): entry is [string, string] => (
        entry[0].trim().length > 0 && entry[1].trim().length > 0
      ))
      .sort(([a], [b]) => compareAssetRoles(a, b));
    if (entries.length === 0) return;
    const labelByUrl = new Map(entries.map(([key, url]) => [url, key]));
    await this.upsertWorkspaceImageAssetsTx(scope, {
      organizationId: input.organizationId,
      contentWorkspaceId: requireWorkspaceId(input.contentWorkspaceId),
      createdByUserId: null,
      imageUrls: entries.map(([, url]) => url),
      role: 'detail_image',
      labelForUrl: (url) => labelByUrl.get(url) ?? null,
    });
  }

  syncGenerationImageUsages(
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.prisma.$transaction((tx) => this.syncGenerationImageUsagesInScope(tx, input));
  }

  /** 편집한 상세 HTML 이 쓰는 사진을 워크스페이스 자산으로 기록한다. 사용 행은 없다 — 사용은 revision 의 image_urls 다. */
  syncGenerationImageUsagesInScope(
    scope: ContentAssetLibraryWriteScope,
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.upsertWorkspaceImageAssetsTx(scope, {
      organizationId: input.organizationId,
      contentWorkspaceId: requireWorkspaceId(input.contentWorkspaceId),
      createdByUserId: input.createdByUserId,
      imageUrls: input.imageUrls,
      role: 'detail_image',
    });
  }

  async listAssets(input: ContentAssetListRepositoryInput) {
    const where: Prisma.ContentAssetWhereInput = {
      organizationId: input.organizationId,
      isDeleted: false,
      ...(input.contentWorkspaceId ? { contentWorkspaceId: input.contentWorkspaceId } : {}),
      ...(input.thumbnailGenerationId ? { thumbnailGenerationId: input.thumbnailGenerationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentAsset.count({ where }),
      this.prisma.contentAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: assetRowSelect,
      }),
    ]);
    return { total, rows: rows.map(toAssetRow) };
  }

  async listWorkspaceThumbnailGallery(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<ContentAssetRow[]> {
    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: { id: input.contentWorkspaceId, organizationId: input.organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Content workspace not found.');
    const rows = await this.prisma.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        role: 'thumbnail',
        source: { in: ['upload', 'ai'] },
        isDeleted: false,
      },
      orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      select: assetRowSelect,
    });
    return rows.map(toAssetRow);
  }

  async setCurrentThumbnail(input: {
    organizationId: string;
    contentWorkspaceId: string;
    assetId: string;
  }): Promise<ContentAssetRow> {
    return this.prisma.$transaction(async (tx) => {
      if (!await lockActiveWorkspace(tx, input.organizationId, input.contentWorkspaceId)) {
        throw new NotFoundException('Content workspace not found.');
      }
      const owned = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM content_assets
        WHERE id = ${input.assetId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND content_workspace_id = ${input.contentWorkspaceId}::uuid
          AND is_deleted = false
        FOR UPDATE
      `);
      if (owned.length !== 1) {
        throw new BadRequestException('The asset is not an image of this content workspace.');
      }
      await tx.contentWorkspace.updateMany({
        where: { id: input.contentWorkspaceId, organizationId: input.organizationId, isDeleted: false },
        data: { currentThumbnailAssetId: input.assetId },
      });
      const row = await tx.contentAsset.findFirstOrThrow({
        where: { id: input.assetId, organizationId: input.organizationId },
        select: assetRowSelect,
      });
      return toAssetRow(row);
    });
  }

  /**
   * 판매 상품 작업공간의 등록용 사진. 채택하지 않은 AI 후보는 몰 추가이미지로 가지 않는다 — 대표이미지로
   * 고른 후보는 서비스가 현재 대표이미지로 보강한다.
   */
  async listSalesProductAssets(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductContentAssetRow[]> {
    return this.prisma.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        assetType: 'image',
        source: { not: 'ai' },
        contentWorkspace: {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
          status: 'active',
          isDeleted: false,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { role: true, url: true, sortOrder: true },
    });
  }

  async findSalesProductCurrentThumbnail(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<SalesProductCurrentThumbnailRow | null> {
    const found = await this.findSalesProductCurrentThumbnails({
      organizationId: input.organizationId,
      salesProductIds: [input.salesProductId],
    });
    return found.get(input.salesProductId) ?? null;
  }

  async findSalesProductCurrentThumbnails(input: {
    organizationId: string;
    salesProductIds: string[];
  }): Promise<Map<string, SalesProductCurrentThumbnailRow>> {
    const result = new Map<string, SalesProductCurrentThumbnailRow>();
    const ids = [...new Set(input.salesProductIds.filter(Boolean))];
    if (ids.length === 0) return result;
    const workspaces = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId: input.organizationId,
        salesProductId: { in: ids },
        status: 'active',
        isDeleted: false,
        currentThumbnailAssetId: { not: null },
      },
      select: {
        salesProductId: true,
        currentThumbnailAsset: {
          select: { id: true, url: true, source: true, thumbnailGenerationId: true, isDeleted: true },
        },
      },
    });
    for (const workspace of workspaces) {
      const salesProductId = workspace.salesProductId;
      const asset = workspace.currentThumbnailAsset;
      if (!salesProductId || !asset || asset.isDeleted) continue;
      const url = asset.url.trim();
      if (!url) continue;
      result.set(salesProductId, {
        assetId: asset.id,
        url,
        source: asset.source as ContentAssetSource,
        thumbnailGenerationId: asset.thumbnailGenerationId,
      });
    }
    return result;
  }

  async replaceWorkspaceThumbnailGallery(
    input: ReplaceWorkspaceThumbnailGalleryInput,
  ): Promise<{ urls: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      if (!await lockActiveWorkspace(tx, input.organizationId, input.contentWorkspaceId)) {
        throw new NotFoundException('Content workspace not found.');
      }
      const keptKeys: string[] = [];
      for (const [index, url] of input.urls.entries()) {
        const assetKey = workspaceThumbnailAssetKey(input.contentWorkspaceId, url);
        keptKeys.push(assetKey);
        await tx.contentAsset.upsert({
          where: { organizationId_assetKey: { organizationId: input.organizationId, assetKey } },
          // 재저장은 순서만 바뀌는 경우가 대부분이라 위치/부활만 갱신한다.
          update: { url, role: 'thumbnail', sortOrder: index, isDeleted: false, deletedAt: null },
          create: {
            organizationId: input.organizationId,
            contentWorkspaceId: input.contentWorkspaceId,
            source: 'upload',
            createdByUserId: input.createdByUserId,
            assetKey,
            url,
            storageKey: this.imageStorage?.extractKey(url) ?? null,
            assetType: 'image',
            role: 'thumbnail',
            sortOrder: index,
            metadata: { urlHash: hashContentAssetUrl(url) },
          },
          select: { id: true },
        });
      }

      // 목록에서 빠진 업로드만 소프트 삭제한다. AI 후보와 채택된 대표이미지는 남긴다.
      const workspace = await tx.contentWorkspace.findFirstOrThrow({
        where: { id: input.contentWorkspaceId, organizationId: input.organizationId },
        select: { currentThumbnailAssetId: true },
      });
      await tx.contentAsset.updateMany({
        where: {
          organizationId: input.organizationId,
          contentWorkspaceId: input.contentWorkspaceId,
          source: 'upload',
          role: 'thumbnail',
          isDeleted: false,
          ...(keptKeys.length > 0 ? { assetKey: { notIn: keptKeys } } : {}),
          ...(workspace.currentThumbnailAssetId ? { id: { not: workspace.currentThumbnailAssetId } } : {}),
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      return { urls: [...input.urls] };
    });
  }

  private async upsertWorkspaceImageAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      contentWorkspaceId: string;
      createdByUserId: string | null;
      imageUrls: string[];
      role: string;
      labelForUrl?: (url: string) => string | null;
    },
  ): Promise<PersistedContentAssetRef[]> {
    const entries = normalizeImageUrls(input.imageUrls);
    if (entries.length === 0) return [];
    const data = entries.map(({ url, firstIndex }) => ({
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      source: 'detail_generation',
      createdByUserId: input.createdByUserId,
      assetKey: workspaceImageAssetKey(input.contentWorkspaceId, input.role, url),
      url,
      storageKey: this.imageStorage?.extractKey(url) ?? null,
      assetType: 'image',
      role: input.role,
      label: input.labelForUrl?.(url) ?? null,
      sortOrder: firstIndex,
      metadata: { urlHash: hashContentAssetUrl(url) },
    }));
    await scope.contentAsset.createMany({ skipDuplicates: true, data });
    return scope.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        assetKey: { in: data.map((item) => item.assetKey) },
        isDeleted: false,
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, assetKey: true, url: true, role: true, label: true, sortOrder: true },
    });
  }
}

async function lockActiveWorkspace(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contentWorkspaceId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_workspaces
    WHERE id = ${contentWorkspaceId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND status = 'active'
      AND is_deleted = false
    FOR UPDATE
  `);
  return rows.length === 1;
}

function toAssetRow(row: AssetRecord): ContentAssetRow {
  const { contentWorkspace, ...asset } = row;
  return {
    ...asset,
    source: asset.source as ContentAssetSource,
    isCurrentThumbnail: contentWorkspace.currentThumbnailAssetId === asset.id,
  };
}

function requireWorkspaceId(contentWorkspaceId: string | undefined): string {
  if (!contentWorkspaceId) {
    throw new Error('content_asset_workspace_required: detail-page assets belong to a content workspace (KID-313).');
  }
  return contentWorkspaceId;
}

function normalizeImageUrls(imageUrls: string[]): Array<{ url: string; firstIndex: number }> {
  const seen = new Map<string, number>();
  for (const [index, raw] of imageUrls.entries()) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.set(url, index);
  }
  return [...seen.entries()].map(([url, firstIndex]) => ({ url, firstIndex }));
}

function compareAssetRoles(a: string, b: string): number {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const aIsNumber = Number.isInteger(aNumber) && a.trim() === String(aNumber);
  const bIsNumber = Number.isInteger(bNumber) && b.trim() === String(bNumber);
  if (aIsNumber && bIsNumber) return aNumber - bNumber;
  if (aIsNumber) return -1;
  if (bIsNumber) return 1;
  return a.localeCompare(b);
}
