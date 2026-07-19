import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  groupUrlAssetKey,
  hashContentAssetUrl,
  workspaceThumbnailAssetKey,
} from '../../../domain/content-asset-key';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';
import type {
  CandidateContentAssetRow,
  ContentAssetLibraryRepositoryPort,
  ContentAssetLibraryWriteScope,
  ContentAssetListRepositoryInput,
  PersistedContentAssetRef,
  RecordDetailPageGeneratedAssetsInput,
  RecordDetailPageInputAssetsInput,
  ReplaceWorkspaceThumbnailGalleryInput,
  SyncGenerationImageUsagesInput,
} from '../../../application/port/out/repository/content-asset-library.repository.port';

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
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM content_assets
        WHERE id = ${input.contentAssetId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND is_deleted = false
        FOR UPDATE
      `);
      if (locked.length !== 1) return { status: 'not_found' as const };
      const asset = await tx.contentAsset.findFirst({
        where: {
          id: input.contentAssetId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: {
          id: true,
          _count: {
            select: {
              usages: {
                where: {
                  contentGeneration: {
                    organizationId: input.organizationId,
                    isDeleted: false,
                  },
                },
              },
              thumbnailSelections: {
                where: {
                  currentForWorkspace: {
                    is: {
                      organizationId: input.organizationId,
                      status: 'active',
                      isDeleted: false,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!asset) return { status: 'not_found' as const };
      if (asset._count.usages > 0 || asset._count.thumbnailSelections > 0) {
        return { status: 'in_use' as const };
      }
      const deleted = await tx.contentAsset.updateMany({
        where: {
          id: asset.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { isDeleted: true, deletedAt: input.deletedAt },
      });
      return { status: deleted.count === 1 ? 'deleted' as const : 'not_found' as const };
    });
  }

  recordDetailPageInputAssets(
    input: RecordDetailPageInputAssetsInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.prisma.$transaction((tx) =>
      this.upsertGroupImageAssetsTx(tx, {
        organizationId: input.organizationId,
        generationGroupId: input.generationGroupId,
        createdByUserId: input.createdByUserId,
        imageUrls: input.imageUrls,
        role: 'source',
      }),
    );
  }

  async recordDetailPageGeneratedAssets(
    input: RecordDetailPageGeneratedAssetsInput,
  ): Promise<void> {
    const entries = Object.entries(input.processedImages)
      .filter((entry): entry is [string, string] => (
        entry[0].trim().length > 0 && entry[1].trim().length > 0
      ))
      .sort(([a], [b]) => compareAssetRoles(a, b));
    if (entries.length === 0) return;

    const imageUrls = entries.map(([, url]) => url);
    const roleByUrl = new Map(entries.map(([role, url]) => [url, role]));
    await this.prisma.$transaction(async (tx) => {
      const assets = await this.upsertGroupImageAssetsTx(tx, {
        organizationId: input.organizationId,
        generationGroupId: input.generationGroupId,
        createdByUserId: null,
        imageUrls,
        roleForUrl: (url) => roleByUrl.get(url) ?? null,
      });
      await this.replaceGenerationAssetUsagesTx(tx, {
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
        contentAssetIds: assets.map((asset) => asset.id),
      });
    });
  }

  syncGenerationImageUsages(
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]> {
    return this.prisma.$transaction((tx) =>
      this.syncGenerationImageUsagesInScope(tx, input),
    );
  }

  async syncGenerationImageUsagesInScope(
    scope: ContentAssetLibraryWriteScope,
    input: SyncGenerationImageUsagesInput,
  ): Promise<PersistedContentAssetRef[]> {
    const assets = await this.upsertGroupImageAssetsTx(scope, {
      organizationId: input.organizationId,
      generationGroupId: input.generationGroupId,
      createdByUserId: input.createdByUserId,
      imageUrls: input.imageUrls,
      role: 'used',
    });
    await this.replaceGenerationAssetUsagesTx(scope, {
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      contentAssetIds: assets.map((asset) => asset.id),
    });
    return assets;
  }

  async listAssets(input: ContentAssetListRepositoryInput) {
    const where = {
      organizationId: input.organizationId,
      isDeleted: false,
      ...(input.contentWorkspaceId
        ? { originGenerationGroup: { contentWorkspaceId: input.contentWorkspaceId } }
        : {}),
      ...(input.generationId
        ? { usages: { some: { contentGenerationId: input.generationId } } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentAsset.count({ where }),
      this.prisma.contentAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          originGenerationGroupId: true,
          url: true,
          assetType: true,
          role: true,
          label: true,
          sortOrder: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          originGenerationGroup: {
            select: {
              contentWorkspace: {
                select: { id: true, displayName: true },
              },
            },
          },
        },
      }),
    ]);
    return { total, rows };
  }

  async listCandidateAssets(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateContentAssetRow[]> {
    return this.prisma.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        assetType: 'image',
        originGenerationGroup: {
          contentWorkspace: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            isDeleted: false,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { role: true, url: true, sortOrder: true },
    });
  }

  async replaceWorkspaceThumbnailGallery(
    input: ReplaceWorkspaceThumbnailGalleryInput,
  ): Promise<{ urls: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const workspaceLocked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM content_workspaces
        WHERE id = ${input.contentWorkspaceId}::uuid
          AND organization_id = ${input.organizationId}::uuid
          AND status = 'active'
          AND is_deleted = false
        FOR UPDATE
      `);
      if (workspaceLocked.length !== 1) {
        throw new NotFoundException('Content workspace not found.');
      }

      const groupId = await this.ensureWorkspaceAssetGroup(tx, input);
      const keptKeys: string[] = [];
      for (const [index, url] of input.urls.entries()) {
        const assetKey = workspaceThumbnailAssetKey(input.contentWorkspaceId, url);
        keptKeys.push(assetKey);
        await tx.contentAsset.upsert({
          where: {
            organizationId_assetKey: { organizationId: input.organizationId, assetKey },
          },
          // 재저장은 순서만 바뀌는 경우가 대부분이라 위치/부활만 갱신한다.
          update: {
            url,
            role: 'thumbnail',
            sortOrder: index,
            isDeleted: false,
            deletedAt: null,
          },
          create: {
            organizationId: input.organizationId,
            originGenerationGroupId: groupId,
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

      // 목록에서 빠진 항목은 소프트 삭제한다. 단 현재 대표 썸네일 선택이 가리키는
      // 자산은 남긴다 — 선택이 참조 중인 자산 삭제는 도메인 규칙 위반이다.
      await tx.contentAsset.updateMany({
        where: {
          organizationId: input.organizationId,
          originGenerationGroupId: groupId,
          role: 'thumbnail',
          isDeleted: false,
          assetKey: {
            startsWith: `workspace-thumbnail:${input.contentWorkspaceId}:`,
            notIn: keptKeys.length > 0 ? keptKeys : undefined,
          },
          thumbnailSelections: { none: {} },
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      return { urls: [...input.urls] };
    });
  }

  private async ensureWorkspaceAssetGroup(
    tx: Prisma.TransactionClient,
    input: { organizationId: string; contentWorkspaceId: string; createdByUserId: string | null },
  ): Promise<string> {
    const existing = await tx.contentGenerationGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        groupType: 'workspace_assets',
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        groupType: 'workspace_assets',
        title: 'Workspace managed assets',
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async upsertGroupImageAssetsTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      generationGroupId: string;
      createdByUserId: string | null;
      imageUrls: string[];
      role?: string;
      roleForUrl?: (url: string) => string | null;
    },
  ): Promise<PersistedContentAssetRef[]> {
    const entries = normalizeImageUrls(input.imageUrls);
    if (entries.length === 0) return [];
    const data = entries.map(({ url, firstIndex }) => {
      const hash = hashContentAssetUrl(url);
      return {
        organizationId: input.organizationId,
        originGenerationGroupId: input.generationGroupId,
        createdByUserId: input.createdByUserId,
        assetKey: groupUrlAssetKey(input.generationGroupId, url),
        url,
        storageKey: this.imageStorage?.extractKey(url) ?? null,
        assetType: 'image',
        role: input.roleForUrl?.(url) ?? input.role ?? null,
        sortOrder: firstIndex,
        metadata: { urlHash: hash },
      };
    });
    await scope.contentAsset.createMany({
      skipDuplicates: true,
      data,
    });
    return scope.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        originGenerationGroupId: input.generationGroupId,
        assetKey: { in: data.map((item) => item.assetKey) },
        isDeleted: false,
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        assetKey: true,
        url: true,
        role: true,
        label: true,
        sortOrder: true,
      },
    });
  }

  private async replaceGenerationAssetUsagesTx(
    scope: ContentAssetLibraryWriteScope,
    input: {
      organizationId: string;
      contentGenerationId: string;
      contentAssetIds: string[];
    },
  ): Promise<void> {
    const uniqueAssetIds = [...new Set(input.contentAssetIds)].sort();
    const rawScope = scope as ContentAssetLibraryWriteScope & {
      $queryRaw<T>(query: Prisma.Sql): Promise<T>;
    };
    const lockedGeneration = await rawScope.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM content_generations
      WHERE id = ${input.contentGenerationId}::uuid
        AND organization_id = ${input.organizationId}::uuid
        AND is_deleted = false
      FOR UPDATE
    `);
    if (lockedGeneration.length !== 1) {
      throw new ConflictException(
        'Content generation changed while usages were being updated.',
      );
    }
    if (uniqueAssetIds.length > 0) {
      const locked = await rawScope.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM content_assets
        WHERE organization_id = ${input.organizationId}::uuid
          AND id IN (${Prisma.join(uniqueAssetIds)})
          AND is_deleted = false
        ORDER BY id
        FOR UPDATE
      `);
      if (locked.length !== uniqueAssetIds.length) {
        throw new ConflictException(
          'Content asset selection changed while usages were being updated.',
        );
      }
    }
    await scope.contentGenerationAssetUsage.deleteMany({
      where: {
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
      },
    });
    if (uniqueAssetIds.length === 0) return;
    await scope.contentGenerationAssetUsage.createMany({
      skipDuplicates: true,
      data: uniqueAssetIds.map((contentAssetId) => ({
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
        contentAssetId,
      })),
    });
  }
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
