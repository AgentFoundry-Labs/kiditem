import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { toDetailPageStoredJson } from './detail-page-stored.helpers';

type ArchiveContentType = 'detail_page' | 'image';
type ArchiveLinkState = 'linked' | 'unlinked';
type WorkspaceType = 'product' | 'unlinked_group';

function detailPageEditorHref(input: {
  generationId: string;
  sourceCandidateId?: string | null;
}): string {
  const generationId = encodeURIComponent(input.generationId);
  if (!input.sourceCandidateId) {
    return `/product-pipeline/detail-pages/${generationId}/editor`;
  }
  const sourceCandidateId = encodeURIComponent(input.sourceCandidateId);
  const returnTo = encodeURIComponent(`/product-pipeline/collected-products/${sourceCandidateId}`);
  return `/product-pipeline/detail-pages/${generationId}/editor?sourceCandidateId=${sourceCandidateId}&returnTo=${returnTo}`;
}

export interface ContentArchiveListQuery {
  page?: number;
  limit?: number;
  contentType?: ArchiveContentType | null;
  linkState?: ArchiveLinkState | null;
  status?: string | null;
  sourceCandidateId?: string | null;
  productId?: string | null;
}

export interface ProductContentWorkspaceItem {
  id: string;
  workspaceType: WorkspaceType;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  productId: string | null;
  product: { id: string; code: string; name: string } | null;
  generationGroupId: string | null;
  href: string;
  generationCount: number;
  detailPageCount: number;
  imageCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  latestUpdatedAt: string;
}

export interface ProductContentGenerationItem {
  id: string;
  contentType: ArchiveContentType;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  href: string | null;
  status: string;
  templateId: string | null;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  errorMessage: string | null;
  productId: string | null;
  generationGroupId: string | null;
  sourceCandidateId: string | null;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  detailPageRevisions: Array<{
    id: string;
    revisionType: string;
    createdAt: string;
  }>;
  sources: Array<{
    id: string;
    sourceType: string;
    sourceCandidateId: string | null;
    sourceContentGenerationId: string | null;
    contentAssetId: string | null;
    label: string | null;
  }>;
  outputAssets: Array<{ id: string; url: string; role: string | null; label: string | null }>;
  createdAt: string;
  updatedAt: string;
}

const generationInclude = {
  generationGroup: {
    select: {
      id: true,
      title: true,
      groupType: true,
      targetMasterId: true,
      targetMaster: {
        select: { id: true, code: true, name: true, thumbnailUrl: true, imageUrl: true },
      },
    },
  },
  assetUsages: {
    where: {
      contentAsset: { isDeleted: false },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      contentAsset: {
        select: { id: true, url: true, role: true, label: true, sortOrder: true, createdAt: true },
      },
    },
  },
  sources: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      sourceType: true,
      sourceCandidateId: true,
      sourceContentGenerationId: true,
      contentAssetId: true,
      label: true,
    },
  },
  detailPageArtifact: {
    select: {
      id: true,
      sourceCandidateId: true,
      isDeleted: true,
      currentRevisionId: true,
      currentRevision: {
        select: {
          id: true,
          revisionType: true,
          createdAt: true,
        },
      },
      revisions: {
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          revisionType: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.ContentGenerationInclude;

type GenerationRow = Prisma.ContentGenerationGetPayload<{ include: typeof generationInclude }>;

@Injectable()
export class ContentArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaces(
    organizationId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{ items: ProductContentWorkspaceItem[]; total: number; page: number; limit: number }> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const rows = await this.prisma.contentGeneration.findMany({
      where: this.generationWhere(organizationId, query),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: generationInclude,
    });
    const groups = this.groupWorkspaces(rows);
    const items = groups.slice((page - 1) * limit, page * limit);
    return { items, total: groups.length, page, limit };
  }

  async listProductWorkspace(
    organizationId: string,
    productId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    workspace: ProductContentWorkspaceItem;
    generations: ProductContentGenerationItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const product = await this.prisma.masterProduct.findFirst({
      where: { id: productId, organizationId, isDeleted: false },
      select: { id: true, code: true, name: true, thumbnailUrl: true, imageUrl: true },
    });
    if (!product) throw new NotFoundException('MasterProduct not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    const where = this.generationWhere(organizationId, { ...query, productId, linkState: 'linked' });
    const [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where }),
      this.prisma.contentGeneration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: generationInclude,
      }),
    ]);
    const workspace = this.workspaceFromRows({
      workspaceType: 'product',
      key: product.id,
      rows,
      fallbackProduct: product,
    });
    return {
      workspace,
      generations: rows.map((row) => this.toGenerationItem(row)),
      total,
      page,
      limit,
    };
  }

  async listGroupWorkspace(
    organizationId: string,
    groupId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    workspace: ProductContentWorkspaceItem;
    generations: ProductContentGenerationItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const group = await this.prisma.contentGenerationGroup.findFirst({
      where: { id: groupId, organizationId },
      select: { id: true, title: true, groupType: true },
    });
    if (!group) throw new NotFoundException('Content generation group not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    const where = this.generationWhere(organizationId, { ...query, linkState: 'unlinked' });
    const scopedWhere: Prisma.ContentGenerationWhereInput = {
      ...where,
      generationGroupId: groupId,
      generationGroup: { targetMasterId: null },
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where: scopedWhere }),
      this.prisma.contentGeneration.findMany({
        where: scopedWhere,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: generationInclude,
      }),
    ]);
    if (total === 0) throw new NotFoundException('Unlinked content workspace not found');
    return {
      workspace: this.workspaceFromRows({ workspaceType: 'unlinked_group', key: group.id, rows }),
      generations: rows.map((row) => this.toGenerationItem(row)),
      total,
      page,
      limit,
    };
  }

  async deleteProductWorkspace(
    organizationId: string,
    productId: string,
  ): Promise<{ ok: true; deletedGenerations: number; deletedAssets: number }> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.contentGeneration.findMany({
        where: { organizationId, isDeleted: false, generationGroup: { targetMasterId: productId } },
        select: { id: true, generationGroupId: true },
      });
      if (rows.length === 0) {
        throw new NotFoundException('Product content workspace not found');
      }

      const result = await this.deleteGenerationRows(
        tx,
        organizationId,
        rows.map((row) => row.id),
      );
      return result;
    });
  }

  async deleteGroupWorkspace(
    organizationId: string,
    groupId: string,
  ): Promise<{ ok: true; deletedGenerations: number; deletedAssets: number }> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.contentGenerationGroup.findFirst({
        where: { id: groupId, organizationId },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Content generation group not found');

      const rows = await tx.contentGeneration.findMany({
        where: { organizationId, isDeleted: false, generationGroupId: groupId, generationGroup: { targetMasterId: null } },
        select: { id: true },
      });
      if (rows.length === 0) {
        throw new NotFoundException('Unlinked content workspace not found');
      }

      const result = await this.deleteGenerationRows(
        tx,
        organizationId,
        rows.map((row) => row.id),
      );
      return result;
    });
  }

  async listForSourcingCandidate(
    organizationId: string,
    candidateId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{ items: ProductContentGenerationItem[]; total: number; page: number; limit: number }> {
    const candidate = await this.prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId, isDeleted: false },
      select: { id: true, promotedMasterId: true },
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    let where = this.generationWhere(organizationId, {
      ...query,
      sourceCandidateId: candidate.id,
    });
    let [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where }),
      this.prisma.contentGeneration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: generationInclude,
      }),
    ]);
    if (total === 0 && candidate.promotedMasterId) {
      where = this.generationWhere(organizationId, {
        ...query,
        productId: candidate.promotedMasterId,
        linkState: 'linked',
      });
      [total, rows] = await Promise.all([
        this.prisma.contentGeneration.count({ where }),
        this.prisma.contentGeneration.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: generationInclude,
        }),
      ]);
    }
    return {
      items: rows.map((row) => this.toGenerationItem(row)),
      total,
      page,
      limit,
    };
  }

  private generationWhere(
    organizationId: string,
    query: ContentArchiveListQuery,
  ): Prisma.ContentGenerationWhereInput {
    const masterScope: Prisma.ContentGenerationWhereInput =
      query.productId
        ? { generationGroup: { targetMasterId: query.productId } }
        : query.linkState === 'linked'
          ? { generationGroup: { targetMasterId: { not: null } } }
          : query.linkState === 'unlinked'
            ? { generationGroup: { targetMasterId: null } }
            : {};
    return {
      organizationId,
      isDeleted: false,
      ...(query.contentType ? { contentType: query.contentType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...masterScope,
      ...(query.sourceCandidateId
        ? {
            OR: [
              { sourceCandidateId: query.sourceCandidateId },
              { sources: { some: { sourceCandidateId: query.sourceCandidateId } } },
              { detailPageArtifact: { is: { sourceCandidateId: query.sourceCandidateId, isDeleted: false } } },
            ],
          }
        : {}),
    };
  }

  private groupWorkspaces(rows: GenerationRow[]): ProductContentWorkspaceItem[] {
    const grouped = new Map<string, GenerationRow[]>();
    for (const row of rows) {
      const productId = row.generationGroup.targetMasterId;
      const key = productId
        ? `product:${productId}`
        : `group:${row.generationGroupId}`;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(row);
      else grouped.set(key, [row]);
    }
    return [...grouped.entries()]
      .map(([key, groupRows]) => this.workspaceFromRows({
        workspaceType: key.startsWith('product:') ? 'product' : 'unlinked_group',
        key: key.slice(key.indexOf(':') + 1),
        rows: groupRows,
      }))
      .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
  }

  private workspaceFromRows(input: {
    workspaceType: WorkspaceType;
    key: string;
    rows: GenerationRow[];
    fallbackProduct?: { id: string; code: string; name: string; thumbnailUrl: string | null; imageUrl: string | null };
  }): ProductContentWorkspaceItem {
    const latest = input.rows[0] ?? null;
    const product = latest?.generationGroup.targetMaster ?? input.fallbackProduct ?? null;
    const detailPageCount = input.rows.filter((row) => this.contentType(row) === 'detail_page').length;
    const imageCount = input.rows.filter((row) => this.contentType(row) === 'image').length;
    if (input.workspaceType === 'product') {
      const productId = product?.id ?? input.key;
      return {
        id: `product:${productId}`,
        workspaceType: 'product',
        title: product?.name ?? latest?.generatedTitle ?? '상품 콘텐츠',
        subtitle: `상세페이지 ${detailPageCount}개 · 이미지 ${imageCount}개`,
        thumbnailUrl: latest ? this.pickThumbnail(latest) ?? product?.thumbnailUrl ?? product?.imageUrl ?? null : product?.thumbnailUrl ?? product?.imageUrl ?? null,
        productId,
        product: product ? { id: product.id, code: product.code, name: product.name } : null,
        generationGroupId: null,
        href: `/product-pipeline/registered-products?masterId=${encodeURIComponent(productId)}`,
        generationCount: input.rows.length,
        detailPageCount,
        imageCount,
        latestGenerationId: latest?.id ?? null,
        latestStatus: latest?.status ?? null,
        latestUpdatedAt: (latest?.updatedAt ?? new Date(0)).toISOString(),
      };
    }
    const group = latest?.generationGroup;
    const groupId = group?.id ?? input.key;
    return {
      id: `group:${groupId}`,
      workspaceType: 'unlinked_group',
      title: group?.title ?? latest?.generatedTitle ?? '미연결 콘텐츠 작업',
      subtitle: `상세페이지 ${detailPageCount}개 · 이미지 ${imageCount}개`,
      thumbnailUrl: latest ? this.pickThumbnail(latest) : null,
      productId: null,
      product: null,
      generationGroupId: groupId,
      href: `/product-pipeline/registered-products?generationGroupId=${encodeURIComponent(groupId)}`,
      generationCount: input.rows.length,
      detailPageCount,
      imageCount,
      latestGenerationId: latest?.id ?? null,
      latestStatus: latest?.status ?? null,
      latestUpdatedAt: (latest?.updatedAt ?? new Date(0)).toISOString(),
    };
  }

  private toGenerationItem(row: GenerationRow): ProductContentGenerationItem {
    const contentType = this.contentType(row);
    const productId = row.generationGroup.targetMasterId;
    const detailPageStored = contentType === 'detail_page'
      ? toDetailPageStoredJson({
        templateId: normalizeDetailPageTemplateId(row.templateId),
        generationInput: row.generationInput,
        generationResult: row.generationResult,
      })
      : null;
    const activeArtifact = row.detailPageArtifact?.isDeleted === false
      ? row.detailPageArtifact
      : null;
    const sourceCandidateId =
      row.sourceCandidateId ??
      activeArtifact?.sourceCandidateId ??
      row.sources.find((source) => source.sourceCandidateId)?.sourceCandidateId ??
      null;
    const detailPageRevisionId =
      activeArtifact?.currentRevisionId ??
      activeArtifact?.currentRevision?.id ??
      null;
    return {
      id: row.id,
      contentType,
      title: row.generatedTitle ?? (contentType === 'image' ? '이미지 생성 결과' : '상세페이지 결과'),
      subtitle: row.generationGroup.targetMaster?.name ?? '미연결 작업',
      thumbnailUrl: this.pickThumbnail(row),
      href: contentType === 'detail_page'
        ? detailPageEditorHref({
          generationId: row.id,
          sourceCandidateId,
        })
        : null,
      status: normalizeStatus(row.status),
      templateId: detailPageStored?.templateId ?? null,
      detailPageData: detailPageStored
        ? asPlainRecord(detailPageStored.result)
        : null,
      imageUrls: detailPageStored?.imageUrls ?? [],
      processedImages: detailPageStored?.processedImages ?? {},
      errorMessage: row.errorMessage,
      productId,
      generationGroupId: row.generationGroupId,
      sourceCandidateId,
      detailPageArtifactId: row.detailPageArtifactId,
      detailPageRevisionId,
      detailPageRevisions: (activeArtifact?.revisions ?? []).map((revision) => ({
        id: revision.id,
        revisionType: revision.revisionType,
        createdAt: revision.createdAt.toISOString(),
      })),
      sources: row.sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        sourceCandidateId: source.sourceCandidateId,
        sourceContentGenerationId: source.sourceContentGenerationId,
        contentAssetId: source.contentAssetId,
        label: source.label,
      })),
      outputAssets: sortedUsedAssets(row).map((asset) => ({
        id: asset.id,
        url: asset.url,
        role: asset.role,
        label: asset.label,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private contentType(row: Pick<GenerationRow, 'contentType'>): ArchiveContentType {
    return row.contentType === 'image' ? 'image' : 'detail_page';
  }

  private pickThumbnail(row: GenerationRow): string | null {
    const processed = asStringRecord((row.generationResult as Record<string, unknown>)?.processedImages);
    return processed.__heroBanner ?? sortedUsedAssets(row)[0]?.url ?? pickFirstString((row.generationInput as Record<string, unknown>)?.imageUrls);
  }

  private async deleteGenerationRows(
    tx: Prisma.TransactionClient,
    organizationId: string,
    generationIds: string[],
  ): Promise<{ ok: true; deletedGenerations: number; deletedAssets: number }> {
    const archivedAt = new Date();
    const assets = await tx.contentAsset.updateMany({
      where: {
        organizationId,
        isDeleted: false,
        usages: {
          some: { contentGenerationId: { in: generationIds } },
          none: {
            contentGeneration: {
              organizationId,
              isDeleted: false,
              id: { notIn: generationIds },
            },
          },
        },
      },
      data: { isDeleted: true, deletedAt: archivedAt },
    });
    const generationResult = await tx.contentGeneration.updateMany({
      where: { organizationId, id: { in: generationIds }, isDeleted: false },
      data: { isDeleted: true, deletedAt: archivedAt },
    });
    return {
      ok: true,
      deletedGenerations: generationResult.count,
      deletedAssets: assets.count,
    };
  }
}

function normalizePage(pageRaw?: number, limitRaw?: number): { page: number; limit: number } {
  const page = Number.isFinite(pageRaw) && pageRaw && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw ? Math.floor(limitRaw) : 24),
  );
  return { page, limit };
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
  );
}

function pickFirstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return value.find((item): item is string => typeof item === 'string') ?? null;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeDetailPageTemplateId(value: unknown): 'kids-playful' | 'bold-vertical' {
  return value === 'bold-vertical' || value === 'simple-vertical'
    ? 'bold-vertical'
    : 'kids-playful';
}

function sortedUsedAssets(row: GenerationRow): Array<{
  id: string;
  url: string;
  role: string | null;
  label: string | null;
  sortOrder: number;
  createdAt: Date;
}> {
  return row.assetUsages
    .map((usage) => usage.contentAsset)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

function normalizeStatus(status: string): string {
  if (status === 'READY' || status === 'completed') return 'completed';
  if (status === 'FAILED' || status === 'failed') return 'failed';
  if (status === 'CANCELLED' || status === 'cancelled') return 'cancelled';
  if (status === 'PROCESSING' || status === 'generating') return 'processing';
  return status.toLowerCase();
}
