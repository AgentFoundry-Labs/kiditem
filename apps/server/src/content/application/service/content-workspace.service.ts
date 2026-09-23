import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  type ContentWorkspaceGenerationSnapshot,
  type ContentWorkspaceLifecycleRepositoryPort,
  type ContentWorkspaceSnapshot,
} from '../port/out/repository/content-workspace-lifecycle.repository.port';
import { toDetailPageStoredJson } from './detail-page-stored.helpers';
import type { DetailPageTemplateId } from './detail-page-ai.types';

export interface ContentWorkspaceListQuery {
  page?: number;
  limit?: number;
  status?: string | null;
  normalizedTitle?: string | null;
}

export interface CreateContentWorkspaceInput {
  organizationId: string;
  triggeredByUserId: string | null;
  rawTitle: string;
  salesProductId: string | null;
  channelListingId?: string | null;
}

export interface ContentWorkspaceSummary {
  id: string;
  ownerType: string;
  salesProductId: string | null;
  channelListingId: string | null;
  /** 직접 상세 작업공간의 제목(정규화). 판매 상품 · 리스팅 작업공간은 null — 이름은 그 주인에게 있다. */
  normalizedTitle: string | null;
  status: string;
  href: string;
  generationCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  /** 대표이미지 자산(`currentThumbnailAssetId`). */
  currentThumbnailAsset: { id: string; url: string } | null;
  currentDetailPageGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    id: string;
    contentType: string;
    status: string;
    generatedTitle: string | null;
    templateId: string | null;
    generationInput: unknown;
    detailPageData: Record<string, unknown> | null;
    imageUrls: string[];
    processedImages: Record<string, string>;
    detailPageArtifactId: string | null;
    href: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

@Injectable()
export class ContentWorkspaceService {
  constructor(
    @Inject(CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT)
    private readonly repository: ContentWorkspaceLifecycleRepositoryPort,
  ) {}

  async ensureForGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    salesProductId: string | null;
    channelListingId?: string | null;
  }): Promise<{ id: string; normalizedTitle: string | null }> {
    return this.ensureWorkspace(input);
  }

  async createWorkspace(input: CreateContentWorkspaceInput): Promise<ContentWorkspaceSummary> {
    const workspace = await this.ensureWorkspace(input);
    return this.get(input.organizationId, workspace.id);
  }

  private async ensureWorkspace(input: CreateContentWorkspaceInput): Promise<{
    id: string;
    normalizedTitle: string | null;
  }> {
    const ownerType = ownerTypeFor(input);
    return this.repository.ensureActiveWorkspace({
      organizationId: input.organizationId,
      ownerType,
      salesProductId: input.salesProductId,
      channelListingId: input.channelListingId ?? null,
      // 직접 상세만 제목을 갖는다. 판매 상품 · 리스팅 작업공간의 이름은 그 주인에서 읽는다.
      normalizedTitle: ownerType === 'direct_detail_page' ? normalizeContentTitle(input.rawTitle) : null,
      createdByUserId: input.triggeredByUserId,
    });
  }

  async checkDuplicate(
    organizationId: string,
    rawTitle: string,
  ): Promise<{ exists: boolean; workspace: ContentWorkspaceSummary | null }> {
    const normalizedTitle = normalizeContentTitle(rawTitle);
    const row = await this.repository.findDuplicateByNormalizedTitle({
      organizationId,
      normalizedTitle,
    });
    return {
      exists: Boolean(row),
      workspace: row ? toDuplicateSummary(row) : null,
    };
  }

  /** 판매상품 초안의 작업공간. 아직 콘텐츠를 만든 적이 없으면 null 이다 — 만드는 일은 생성이 한다. */
  async getForSalesProduct(
    organizationId: string,
    salesProductId: string,
  ): Promise<{ workspace: ContentWorkspaceSummary | null }> {
    const workspaceId = await this.repository.findActiveSalesProductWorkspaceId({ organizationId, salesProductId });
    return { workspace: workspaceId ? await this.get(organizationId, workspaceId) : null };
  }

  async get(
    organizationId: string,
    workspaceId: string,
  ): Promise<ContentWorkspaceSummary> {
    const row = await this.repository.getById({ organizationId, workspaceId });
    if (!row) throw new NotFoundException('Content workspace not found');
    return this.toSummary(row);
  }

  async list(
    organizationId: string,
    query: ContentWorkspaceListQuery = {},
  ): Promise<{ items: ContentWorkspaceSummary[]; total: number; page: number; limit: number }> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const normalizedTitle = query.normalizedTitle
      ? normalizeContentTitle(query.normalizedTitle)
      : null;
    const { total, rows } = await this.repository.listActive({
      organizationId,
      status: query.status ?? 'active',
      normalizedTitle,
      page,
      limit,
    });
    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      limit,
    };
  }

  async archive(
    organizationId: string,
    workspaceId: string,
  ): Promise<{ ok: true; archivedWorkspaces: number }> {
    const archivedAt = new Date();
    const archivedWorkspaces = await this.repository.archive({
      organizationId,
      workspaceId,
      archivedAt,
    });
    if (archivedWorkspaces === 0) throw new NotFoundException('Content workspace not found');
    return { ok: true, archivedWorkspaces };
  }

  async selectCurrentDetailPage(input: {
    organizationId: string;
    workspaceId: string;
    contentGenerationId: string;
  }): Promise<ContentWorkspaceSummary> {
    const generation = await this.repository.findSelectableDetailPageGeneration({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      contentGenerationId: input.contentGenerationId,
    });
    if (!generation) throw new NotFoundException('Detail page generation not found');
    if (!generation.detailPageArtifactId) {
      throw new BadRequestException('Detail page artifact is not ready');
    }

    const updated = await this.repository.selectCurrentDetailPage({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      detailPageArtifactId: generation.detailPageArtifactId,
      detailPageRevisionId: generation.detailPageArtifact?.currentRevisionId ?? null,
    });
    if (updated === 0) throw new NotFoundException('Content workspace not found');
    return this.get(input.organizationId, input.workspaceId);
  }

  private toSummary(row: ContentWorkspaceSnapshot): ContentWorkspaceSummary {
    const history = [...(row.contentGenerations ?? [])]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const latest = history[0] ?? null;
    const currentDetailPageGenerationId =
      row.currentDetailPageArtifact?.sourceContentGenerationId ??
      (
        row.currentDetailPageArtifactId
          ? history.find((generation) => generation.detailPageArtifactId === row.currentDetailPageArtifactId)?.id
          : null
      ) ??
      null;
    return {
      id: row.id,
      ownerType: row.ownerType,
      salesProductId: row.salesProductId,
      channelListingId: row.channelListingId,
      normalizedTitle: row.normalizedTitle,
      status: row.status,
      href: registeredWorkspaceHref(row.id),
      generationCount: row._count?.contentGenerations ?? history.length,
      latestGenerationId: latest?.id ?? null,
      latestStatus: latest?.status ?? null,
      currentDetailPageArtifactId: row.currentDetailPageArtifactId,
      currentDetailPageRevisionId: row.currentDetailPageRevisionId,
      currentThumbnailAsset: row.currentThumbnailAsset,
      currentDetailPageGenerationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: history.map((generation) => ({
        ...this.toHistoryItem(row.id, generation),
      })),
    };
  }

  private toHistoryItem(workspaceId: string, generation: ContentWorkspaceGenerationSnapshot) {
    const detailProjection = projectDetailPageGeneration(generation);
    return {
      id: generation.id,
      contentType: generation.contentType,
      status: generation.status,
      generatedTitle: generation.generatedTitle,
      templateId: generation.templateId,
      generationInput: generation.generationInput,
      detailPageData: detailProjection.detailPageData,
      imageUrls: detailProjection.imageUrls,
      processedImages: detailProjection.processedImages,
      detailPageArtifactId: generation.detailPageArtifactId,
      href: registeredWorkspaceEditorHref(workspaceId, generation.id),
      createdAt: generation.createdAt.toISOString(),
      updatedAt: generation.updatedAt.toISOString(),
    };
  }
}

function projectDetailPageGeneration(generation: ContentWorkspaceGenerationSnapshot): {
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
} {
  if (generation.contentType !== 'detail_page') {
    return { detailPageData: null, imageUrls: [], processedImages: {} };
  }
  const stored = toDetailPageStoredJson({
    templateId: normalizeTemplateId(generation.templateId),
    generationInput: generation.generationInput,
    generationResult: generation.generationResult,
  });
  return {
    detailPageData: asPlainRecord(stored.result),
    imageUrls: stored.imageUrls,
    processedImages: stored.processedImages,
  };
}

function normalizeTemplateId(value: unknown): DetailPageTemplateId {
  if (value === 'bold-vertical' || value === 'simple-vertical') return 'bold-vertical';
  return 'kids-playful';
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeContentTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return normalized || '상세페이지 작업';
}

export function registeredWorkspaceHref(workspaceId: string): string {
  return `/product-pipeline/registered-products/${encodeURIComponent(workspaceId)}`;
}

export function registeredWorkspaceEditorHref(
  workspaceId: string,
  generationId: string,
): string {
  const returnTo = encodeURIComponent(`/product-pipeline/registered-products/${encodeURIComponent(workspaceId)}`);
  return `/product-pipeline/detail-pages/${encodeURIComponent(generationId)}/editor?returnTo=${returnTo}`;
}

function toDuplicateSummary(row: {
  id: string;
  ownerType: string;
  salesProductId: string | null;
  channelListingId: string | null;
  normalizedTitle: string | null;
  status: string;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentThumbnailAsset: { id: string; url: string } | null;
  currentDetailPageArtifact: { sourceContentGenerationId: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { contentGenerations: number };
}): ContentWorkspaceSummary {
  return {
    id: row.id,
    ownerType: row.ownerType,
    salesProductId: row.salesProductId,
    channelListingId: row.channelListingId,
    normalizedTitle: row.normalizedTitle,
    status: row.status,
    href: registeredWorkspaceHref(row.id),
    generationCount: row._count?.contentGenerations ?? 0,
    latestGenerationId: null,
    latestStatus: null,
    currentDetailPageArtifactId: row.currentDetailPageArtifactId,
    currentDetailPageRevisionId: row.currentDetailPageRevisionId,
    currentThumbnailAsset: row.currentThumbnailAsset,
    currentDetailPageGenerationId: row.currentDetailPageArtifact?.sourceContentGenerationId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: [],
  };
}

function ownerTypeFor(input: {
  salesProductId: string | null;
  channelListingId?: string | null;
}): 'sales_product' | 'channel_listing' | 'direct_detail_page' {
  if (input.channelListingId) return 'channel_listing';
  if (input.salesProductId) return 'sales_product';
  return 'direct_detail_page';
}

function normalizePage(pageRaw?: number, limitRaw?: number): { page: number; limit: number } {
  const page = Number.isFinite(pageRaw) && pageRaw && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw ? Math.floor(limitRaw) : 24),
  );
  return { page, limit };
}
