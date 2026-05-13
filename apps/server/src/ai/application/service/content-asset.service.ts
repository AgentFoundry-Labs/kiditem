import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type NullableProductLink = string | null;

export interface ContentAssetListQuery {
  page?: number;
  limit?: number;
  productId?: string | null;
  generationId?: string | null;
  pipelineType?: string | null;
  usageType?: string | null;
  originType?: string | null;
  sourceType?: string | null; // legacy compatibility only
}

export interface PersistedContentAssetRef {
  id: string;
  assetKey: string;
  url: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  usageType: string;
  originType: string;
}

@Injectable()
export class ContentAssetService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDetailPageInputAssets(input: {
    organizationId: string;
    contentGenerationId: string;
    masterId: NullableProductLink;
    createdByUserId: string | null;
    imageUrls: string[];
  }): Promise<PersistedContentAssetRef[]> {
    const data = input.imageUrls
      .map((url, index) => url.trim() ? ({ url: url.trim(), index }) : null)
      .filter((item): item is { url: string; index: number } => item !== null)
      .map(({ url, index }) => ({
        organizationId: input.organizationId,
        masterId: input.masterId,
        contentGenerationId: input.contentGenerationId,
        createdByUserId: input.createdByUserId,
        assetKey: `detail-page-input:${input.contentGenerationId}:${index}`,
        url,
        assetType: 'image',
        sourceType: 'detail_page_input',
        pipelineType: 'detail_page',
        usageType: 'input',
        originType: 'manual_upload',
        role: 'source',
        sortOrder: index,
        metadata: {},
      }));
    if (data.length === 0) return [];
    await this.prisma.contentAsset.createMany({
      skipDuplicates: true,
      data,
    });
    return this.prisma.contentAsset.findMany({
      where: {
        organizationId: input.organizationId,
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
        usageType: true,
        originType: true,
      },
    });
  }

  async recordDetailPageGeneratedAssets(input: {
    organizationId: string;
    contentGenerationId: string;
    masterId: NullableProductLink;
    processedImages: Record<string, string>;
  }): Promise<void> {
    const entries = Object.entries(input.processedImages)
      .filter((entry): entry is [string, string] => (
        entry[0].trim().length > 0 && entry[1].trim().length > 0
      ))
      .sort(([a], [b]) => compareAssetRoles(a, b));
    if (entries.length === 0) return;
    await this.prisma.contentAsset.createMany({
      skipDuplicates: true,
      data: entries.map(([role, url], index) => ({
        organizationId: input.organizationId,
        masterId: input.masterId,
        contentGenerationId: input.contentGenerationId,
        assetKey: `detail-page-generated:${input.contentGenerationId}:${role}`,
        url,
        assetType: 'image',
        sourceType: 'detail_page_generated',
        pipelineType: 'detail_page',
        usageType: 'output',
        originType: 'generated',
        role,
        sortOrder: index,
        metadata: {},
      })),
    });
  }

  async listAssets(
    organizationId: string,
    query: ContentAssetListQuery = {},
  ): Promise<{
    items: Array<{
      id: string;
      productId: string | null;
      generationId: string | null;
      url: string;
      assetType: string;
      sourceType: string;
      pipelineType: string;
      usageType: string;
      originType: string;
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
      ...(query.productId ? { masterId: query.productId } : {}),
      ...(query.generationId ? { contentGenerationId: query.generationId } : {}),
      ...(query.pipelineType ? { pipelineType: query.pipelineType } : {}),
      ...(query.usageType ? { usageType: query.usageType } : {}),
      ...(query.originType ? { originType: query.originType } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
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
          masterId: true,
          contentGenerationId: true,
          url: true,
          assetType: true,
          sourceType: true,
          pipelineType: true,
          usageType: true,
          originType: true,
          role: true,
          label: true,
          sortOrder: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          master: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        productId: row.masterId,
        generationId: row.contentGenerationId,
        url: row.url,
        assetType: row.assetType,
        sourceType: row.sourceType,
        pipelineType: row.pipelineType,
        usageType: row.usageType,
        originType: row.originType,
        role: row.role,
        label: row.label,
        sortOrder: row.sortOrder,
        metadata: row.metadata,
        product: row.master,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }
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
