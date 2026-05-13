import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ContentAssetListQuery {
  page?: number;
  limit?: number;
  productId?: string | null;
  generationId?: string | null;
}

export interface PersistedContentAssetRef {
  id: string;
  assetKey: string;
  url: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
}

type AssetTx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ContentAssetService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDetailPageInputAssets(input: {
    organizationId: string;
    generationGroupId: string;
    createdByUserId: string | null;
    imageUrls: string[];
  }): Promise<PersistedContentAssetRef[]> {
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

  async recordDetailPageGeneratedAssets(input: {
    organizationId: string;
    generationGroupId: string;
    contentGenerationId: string;
    processedImages: Record<string, string>;
  }): Promise<void> {
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

  async syncGenerationImageUsages(input: {
    organizationId: string;
    generationGroupId: string;
    contentGenerationId: string;
    createdByUserId: string | null;
    imageUrls: string[];
  }): Promise<PersistedContentAssetRef[]> {
    return this.prisma.$transaction((tx) =>
      this.syncGenerationImageUsagesTx(tx, input),
    );
  }

  async syncGenerationImageUsagesTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      generationGroupId: string;
      contentGenerationId: string;
      createdByUserId: string | null;
      imageUrls: string[];
    },
  ): Promise<PersistedContentAssetRef[]> {
    const assets = await this.upsertGroupImageAssetsTx(tx, {
      organizationId: input.organizationId,
      generationGroupId: input.generationGroupId,
      createdByUserId: input.createdByUserId,
      imageUrls: input.imageUrls,
      role: 'used',
    });
    await this.replaceGenerationAssetUsagesTx(tx, {
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      contentAssetIds: assets.map((asset) => asset.id),
    });
    return assets;
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
    const where: Prisma.ContentAssetWhereInput = {
      organizationId,
      isDeleted: false,
      ...(query.productId
        ? { generationGroup: { targetMasterId: query.productId } }
        : {}),
      ...(query.generationId
        ? { usages: { some: { contentGenerationId: query.generationId } } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentAsset.count({ where }),
      this.prisma.contentAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          generationGroupId: true,
          url: true,
          assetType: true,
          role: true,
          label: true,
          sortOrder: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          generationGroup: {
            select: {
              targetMaster: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

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

  private async upsertGroupImageAssetsTx(
    tx: AssetTx,
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
      const hash = hashUrl(url);
      return {
        organizationId: input.organizationId,
        generationGroupId: input.generationGroupId,
        createdByUserId: input.createdByUserId,
        assetKey: groupUrlAssetKey(input.generationGroupId, url),
        url,
        assetType: 'image',
        role: input.roleForUrl?.(url) ?? input.role ?? null,
        sortOrder: firstIndex,
        metadata: { urlHash: hash },
      };
    });
    await tx.contentAsset.createMany({
      skipDuplicates: true,
      data,
    });
    return tx.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
        generationGroupId: input.generationGroupId,
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
    tx: AssetTx,
    input: {
      organizationId: string;
      contentGenerationId: string;
      contentAssetIds: string[];
    },
  ): Promise<void> {
    await tx.contentGenerationAssetUsage.deleteMany({
      where: {
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
      },
    });
    const uniqueAssetIds = [...new Set(input.contentAssetIds)];
    if (uniqueAssetIds.length === 0) return;
    await tx.contentGenerationAssetUsage.createMany({
      skipDuplicates: true,
      data: uniqueAssetIds.map((contentAssetId) => ({
        organizationId: input.organizationId,
        contentGenerationId: input.contentGenerationId,
        contentAssetId,
      })),
    });
  }
}

export function groupUrlAssetKey(generationGroupId: string, url: string): string {
  return `group-url:${generationGroupId}:${hashUrl(url).slice(0, 32)}`;
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

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
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
