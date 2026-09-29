import { isRepresentativeAsset } from './representative-asset';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import type { ContentAssetSource } from '@kiditem/shared/product-content';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  hashContentAssetUrl,
  workspaceThumbnailAssetKey,
} from '../../../domain/content-asset-key';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';
import type {
  ContentAssetLibraryRepositoryPort,
  ContentAssetListRepositoryInput,
  ContentAssetRow,
  ReplaceWorkspaceThumbnailGalleryInput,
  SalesProductContentAssetRow,
  SalesProductCurrentThumbnailRow,
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
    if (!workspace) throw new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'workspace' } });
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
    return oneRowPerGalleryUrl(rows.map(toAssetRow));
  }

  async listThumbnailCandidates(input: {
    organizationId: string;
    thumbnailGenerationIds: readonly string[];
  }): Promise<ContentAssetRow[]> {
    if (input.thumbnailGenerationIds.length === 0) return [];
    const rows = await this.prisma.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        thumbnailGenerationId: { in: [...input.thumbnailGenerationIds] },
        isDeleted: false,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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
        throw new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'workspace' } });
      }
      const owned = await tx.$queryRaw<Array<{ id: string; role: string | null; source: string }>>(Prisma.sql`
        SELECT id, role, source
        FROM content_assets
        WHERE id = ${input.assetId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND content_workspace_id = ${input.contentWorkspaceId}::uuid
          AND is_deleted = false
        FOR UPDATE
      `);
      const workspace = await tx.contentWorkspace.findFirstOrThrow({
        where: { id: input.contentWorkspaceId, organizationId: input.organizationId },
        select: { ownerType: true },
      });
      if (owned.length !== 1 || !isRepresentativeAsset(workspace.ownerType, owned[0]!)) {
        throw new KiditemInvalidValueError('CONTENT_SELECTION_INVALID', { details: { reason: 'ASSET_NOT_IN_WORKSPACE' } });
      }
      await tx.contentWorkspace.updateMany({
        where: { id: input.contentWorkspaceId, organizationId: input.organizationId, isDeleted: false },
        data: { currentThumbnailAssetId: input.assetId },
      });
      // 운영자가 고른 대표이미지는 카탈로그 몫이 아니다 — 다음 몰 카탈로그 publication 이 덮지 않게 표시를 지운다.
      await tx.$executeRaw`
        UPDATE content_assets
        SET metadata = metadata - 'catalogRepresentative'
        WHERE id = ${input.assetId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND metadata ? 'catalogRepresentative'
      `;
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
        throw new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'workspace' } });
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
}

/**
 * 미리보기 목록에 넣은 AI 후보는 같은 주소의 업로드 줄이 하나 더 생긴다(저장 목록이 곧 몰 추가이미지라서).
 * 갤러리는 주소마다 한 줄만 보인다 — 채택된 줄이 있으면 그것, 아니면 저장 목록에 든 업로드 줄. 자리는 그 주소가
 * 처음 나온 곳(새것부터)을 지킨다.
 */
function oneRowPerGalleryUrl<T extends { url: string; source: string; isCurrentThumbnail: boolean }>(rows: readonly T[]): T[] {
  const rank = (row: T) => (row.isCurrentThumbnail ? 2 : row.source === 'upload' ? 1 : 0);
  const byUrl = new Map<string, T>();
  for (const row of rows) {
    const key = row.url.trim();
    const kept = byUrl.get(key);
    if (!kept || rank(row) > rank(kept)) byUrl.set(key, row);
  }
  // Map 은 처음 넣은 키의 자리를 지키므로 줄을 바꿔 넣어도 순서가 그대로다.
  return [...byUrl.values()];
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
