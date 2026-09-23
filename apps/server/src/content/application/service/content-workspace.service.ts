import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  type ContentWorkspaceDetailPageSnapshot,
  type ContentWorkspaceLifecycleRepositoryPort,
  type ContentWorkspaceSnapshot,
} from '../port/out/repository/content-workspace-lifecycle.repository.port';
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../port/out/repository/detail-page.repository.port';
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

/**
 * 작업공간 요약(KID-313 W3b). 이름은 없다 — 판매 상품 작업공간은 상품에서, 직접 상세는 상세 페이지 제목에서
 * 읽는다. 상세는 상세 페이지 id 하나로 부른다(`/api/ai/detail-page/:id`).
 */
export interface ContentWorkspaceSummary {
  id: string;
  ownerType: string;
  salesProductId: string | null;
  channelListingId: string | null;
  normalizedTitle: string | null;
  status: string;
  href: string;
  detailPageCount: number;
  latestDetailPageId: string | null;
  latestStatus: string | null;
  /** 몰로 가는 현재 revision 과 그 revision 의 상세 페이지. */
  currentDetailPageId: string | null;
  currentDetailPageRevisionId: string | null;
  currentThumbnailSelection: {
    id: string;
    contentAssetId: string;
    url: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    /** 상세 페이지 id. */
    id: string;
    source: string;
    status: string;
    title: string | null;
    templateId: string | null;
    generationInput: unknown;
    detailPageData: Record<string, unknown> | null;
    imageUrls: string[];
    processedImages: Record<string, string>;
    currentRevisionId: string | null;
    errorMessage: string | null;
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
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
  ) {}

  async ensureForGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    salesProductId: string | null;
    channelListingId?: string | null;
  }): Promise<{ id: string }> {
    return this.ensureWorkspace(input);
  }

  async createWorkspace(input: CreateContentWorkspaceInput): Promise<ContentWorkspaceSummary> {
    const workspace = await this.ensureWorkspace(input);
    return this.get(input.organizationId, workspace.id);
  }

  private async ensureWorkspace(input: CreateContentWorkspaceInput): Promise<{ id: string }> {
    const ownerType = ownerTypeFor(input);
    return this.repository.ensureActiveWorkspace({
      organizationId: input.organizationId,
      ownerType,
      salesProductId: input.salesProductId,
      channelListingId: input.channelListingId ?? null,
      // 이름으로 중복을 막는 것은 상품 없는 직접 상세뿐이다.
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

  /**
   * 운영자가 고른 상세 페이지를 몰로 갈 현재로 삼는다 — 그 페이지의 현재 revision 이 워크스페이스의 현재가 된다.
   * 포인터는 상세 페이지 저장소만 옮긴다.
   */
  async selectCurrentDetailPage(input: {
    organizationId: string;
    workspaceId: string;
    detailPageId: string;
  }): Promise<ContentWorkspaceSummary> {
    const page = await this.detailPages.findById({ organizationId: input.organizationId, detailPageId: input.detailPageId });
    if (!page || page.contentWorkspaceId !== input.workspaceId) throw new NotFoundException('Detail page not found');
    if (!page.currentRevisionId) throw new BadRequestException('Detail page has no saved revision yet');
    const revisionId = page.currentRevisionId;
    await this.detailPages.runInTransaction((transaction) => this.detailPages.setCurrentRevision(transaction, {
      organizationId: input.organizationId,
      contentWorkspaceId: input.workspaceId,
      revisionId,
    }));
    return this.get(input.organizationId, input.workspaceId);
  }

  private toSummary(row: ContentWorkspaceSnapshot): ContentWorkspaceSummary {
    const history = [...(row.detailPages ?? [])]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const latest = history[0] ?? null;
    return {
      ...summaryHead(row),
      detailPageCount: row._count?.detailPages ?? history.length,
      latestDetailPageId: latest?.id ?? null,
      latestStatus: latest?.status ?? null,
      history: history.map((page) => toHistoryItem(row.id, page)),
    };
  }
}

function summaryHead(row: ContentWorkspaceSnapshot): Omit<
  ContentWorkspaceSummary,
  'detailPageCount' | 'latestDetailPageId' | 'latestStatus' | 'history'
> {
  return {
    id: row.id,
    ownerType: row.ownerType,
    salesProductId: row.salesProductId,
    channelListingId: row.channelListingId,
    normalizedTitle: row.normalizedTitle,
    status: row.status,
    href: registeredWorkspaceHref(row.id),
    currentDetailPageId: row.currentDetailPageRevision?.detailPageId ?? null,
    currentDetailPageRevisionId: row.currentDetailPageRevisionId,
    currentThumbnailSelection: row.currentThumbnailSelection
      ? {
          id: row.currentThumbnailSelection.id,
          contentAssetId: row.currentThumbnailSelection.contentAsset.id,
          url: row.currentThumbnailSelection.contentAsset.url,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHistoryItem(workspaceId: string, page: ContentWorkspaceDetailPageSnapshot): ContentWorkspaceSummary['history'][number] {
  const stored = toDetailPageStoredJson({
    templateId: normalizeTemplateId(page.templateId),
    generationInput: page.generationInput,
    generationResult: page.generationResult,
  });
  return {
    id: page.id,
    source: page.source,
    status: page.status,
    title: page.title,
    templateId: page.templateId,
    generationInput: page.generationInput,
    detailPageData: page.source === 'generated' ? asPlainRecord(stored.result) : null,
    imageUrls: stored.imageUrls,
    processedImages: stored.processedImages,
    currentRevisionId: page.currentRevisionId,
    errorMessage: page.errorMessage,
    href: registeredWorkspaceEditorHref(workspaceId, page.id),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
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
  detailPageId: string,
): string {
  const returnTo = encodeURIComponent(`/product-pipeline/registered-products/${encodeURIComponent(workspaceId)}`);
  return `/product-pipeline/detail-pages/${encodeURIComponent(detailPageId)}/editor?returnTo=${returnTo}`;
}

function toDuplicateSummary(row: ContentWorkspaceSnapshot): ContentWorkspaceSummary {
  return {
    ...summaryHead(row),
    detailPageCount: row._count?.detailPages ?? 0,
    latestDetailPageId: null,
    latestStatus: null,
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
