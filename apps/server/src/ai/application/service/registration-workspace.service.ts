import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toDetailPageStoredJson } from './detail-page-stored.helpers';
import type { DetailPageTemplateId } from './detail-page-ai.types';

export interface RegistrationWorkspaceListQuery {
  page?: number;
  limit?: number;
  status?: string | null;
  normalizedTitle?: string | null;
}

export interface CreateRegistrationWorkspaceInput {
  organizationId: string;
  triggeredByUserId: string | null;
  rawTitle: string;
  sourceCandidateId: string | null;
  targetMasterId: string | null;
}

export interface RegistrationWorkspaceSummary {
  id: string;
  ownerType: string;
  sourceCandidateId: string | null;
  targetMasterId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  href: string;
  generationCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
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

interface RegistrationWorkspaceRow {
  id: string;
  ownerType: string;
  sourceCandidateId: string | null;
  targetMasterId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentDetailPageArtifact: {
    id: string;
    currentRevisionId: string | null;
    title: string | null;
    sourceContentGenerationId: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { contentGenerations: number };
  contentGenerations?: RegistrationWorkspaceGenerationRow[];
}

interface RegistrationWorkspaceGenerationRow {
  id: string;
  contentType: string;
  status: string;
  generatedTitle: string | null;
  templateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  detailPageArtifactId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RegistrationWorkspacePrisma {
  contentGeneration: {
    findFirst(args: unknown): Promise<{
      id: string;
      detailPageArtifactId: string | null;
      detailPageArtifact: {
        currentRevisionId: string | null;
      } | null;
    } | null>;
  };
  registrationWorkspace: {
    findFirst(args: unknown): Promise<RegistrationWorkspaceRow | null>;
    findMany(args: unknown): Promise<RegistrationWorkspaceRow[]>;
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<RegistrationWorkspaceRow>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

@Injectable()
export class RegistrationWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForGeneration(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    sourceCandidateId: string | null;
    targetMasterId: string | null;
  }): Promise<{ id: string; displayName: string; normalizedTitle: string }> {
    return this.ensureWorkspace(input);
  }

  async createWorkspace(input: CreateRegistrationWorkspaceInput): Promise<RegistrationWorkspaceSummary> {
    const workspace = await this.ensureWorkspace(input);
    return this.get(input.organizationId, workspace.id);
  }

  private async ensureWorkspace(input: CreateRegistrationWorkspaceInput): Promise<{
    id: string;
    displayName: string;
    normalizedTitle: string;
  }> {
    const normalizedTitle = normalizeRegistrationTitle(input.rawTitle);
    const displayName = displayTitle(input.rawTitle);
    const ownerType = ownerTypeFor(input);
    const where = {
      organizationId: input.organizationId,
      ownerType,
      normalizedTitle,
      status: 'active',
      isDeleted: false,
      ...(ownerType === 'sourcing_candidate'
        ? { sourceCandidateId: input.sourceCandidateId }
        : ownerType === 'master_product'
          ? { targetMasterId: input.targetMasterId }
          : { sourceCandidateId: null, targetMasterId: null }),
    };
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const existing = await prisma.registrationWorkspace.findFirst({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        displayName: true,
        normalizedTitle: true,
      },
    });
    if (existing) {
      return {
        id: existing.id,
        displayName: existing.displayName,
        normalizedTitle: existing.normalizedTitle,
      };
    }
    let created: Pick<RegistrationWorkspaceRow, 'id' | 'displayName' | 'normalizedTitle'>;
    try {
      created = await prisma.registrationWorkspace.create({
        data: {
          organizationId: input.organizationId,
          ownerType,
          sourceCandidateId: input.sourceCandidateId,
          targetMasterId: input.targetMasterId,
          displayName,
          normalizedTitle,
          status: 'active',
          createdByUserId: input.triggeredByUserId,
        },
        select: {
          id: true,
          displayName: true,
          normalizedTitle: true,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await prisma.registrationWorkspace.findFirst({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          displayName: true,
          normalizedTitle: true,
        },
      });
      if (!raced) throw error;
      created = raced;
    }
    return {
      id: created.id,
      displayName: created.displayName,
      normalizedTitle: created.normalizedTitle,
    };
  }

  async checkDuplicate(
    organizationId: string,
    rawTitle: string,
  ): Promise<{ exists: boolean; workspace: RegistrationWorkspaceSummary | null }> {
    const normalizedTitle = normalizeRegistrationTitle(rawTitle);
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const row = await prisma.registrationWorkspace.findFirst({
      where: {
        organizationId,
        normalizedTitle,
        status: 'active',
        isDeleted: false,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        ownerType: true,
        sourceCandidateId: true,
        targetMasterId: true,
        displayName: true,
        normalizedTitle: true,
        status: true,
        currentDetailPageArtifactId: true,
        currentDetailPageRevisionId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contentGenerations: true } },
        currentDetailPageArtifact: {
          select: { sourceContentGenerationId: true },
        },
      },
    });
    return {
      exists: Boolean(row),
      workspace: row ? toDuplicateSummary(row) : null,
    };
  }

  async get(
    organizationId: string,
    workspaceId: string,
  ): Promise<RegistrationWorkspaceSummary> {
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const row = await prisma.registrationWorkspace.findFirst({
      where: {
        id: workspaceId,
        organizationId,
        isDeleted: false,
      },
      include: workspaceInclude(),
    });
    if (!row) throw new NotFoundException('Registration workspace not found');
    return this.toSummary(row);
  }

  async list(
    organizationId: string,
    query: RegistrationWorkspaceListQuery = {},
  ): Promise<{ items: RegistrationWorkspaceSummary[]; total: number; page: number; limit: number }> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const normalizedTitle = query.normalizedTitle
      ? normalizeRegistrationTitle(query.normalizedTitle)
      : null;
    const where = {
      organizationId,
      status: query.status ?? 'active',
      isDeleted: false,
      ownerType: { not: 'sourcing_candidate' },
      ...(normalizedTitle ? { normalizedTitle } : {}),
    };
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const [total, rows] = await Promise.all([
      prisma.registrationWorkspace.count({ where }),
      prisma.registrationWorkspace.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: workspaceInclude(),
      }),
    ]);
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
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const result = await prisma.registrationWorkspace.updateMany({
      where: {
        id: workspaceId,
        organizationId,
        isDeleted: false,
      },
      data: {
        status: 'archived',
        isDeleted: true,
        deletedAt: archivedAt,
      },
    });
    if (result.count === 0) throw new NotFoundException('Registration workspace not found');
    return { ok: true, archivedWorkspaces: result.count };
  }

  async selectCurrentDetailPage(input: {
    organizationId: string;
    workspaceId: string;
    contentGenerationId: string;
  }): Promise<RegistrationWorkspaceSummary> {
    const prisma = this.prisma as unknown as RegistrationWorkspacePrisma;
    const generation = await prisma.contentGeneration.findFirst({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
        registrationWorkspaceId: input.workspaceId,
        contentType: 'detail_page',
        isDeleted: false,
      },
      select: {
        id: true,
        detailPageArtifactId: true,
        detailPageArtifact: {
          select: {
            currentRevisionId: true,
          },
        },
      },
    });
    if (!generation) throw new NotFoundException('Detail page generation not found');
    if (!generation.detailPageArtifactId) {
      throw new BadRequestException('Detail page artifact is not ready');
    }

    const updated = await prisma.registrationWorkspace.updateMany({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: {
        currentDetailPageArtifactId: generation.detailPageArtifactId,
        currentDetailPageRevisionId: generation.detailPageArtifact?.currentRevisionId ?? null,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Registration workspace not found');
    return this.get(input.organizationId, input.workspaceId);
  }

  private toSummary(row: RegistrationWorkspaceRow): RegistrationWorkspaceSummary {
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
      sourceCandidateId: row.sourceCandidateId,
      targetMasterId: row.targetMasterId,
      displayName: row.displayName,
      normalizedTitle: row.normalizedTitle,
      status: row.status,
      href: registeredWorkspaceHref(row.id),
      generationCount: row._count?.contentGenerations ?? history.length,
      latestGenerationId: latest?.id ?? null,
      latestStatus: latest?.status ?? null,
      currentDetailPageArtifactId: row.currentDetailPageArtifactId,
      currentDetailPageRevisionId: row.currentDetailPageRevisionId,
      currentDetailPageGenerationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      history: history.map((generation) => ({
        ...this.toHistoryItem(row.id, generation),
      })),
    };
  }

  private toHistoryItem(workspaceId: string, generation: RegistrationWorkspaceGenerationRow) {
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

function projectDetailPageGeneration(generation: RegistrationWorkspaceGenerationRow): {
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

export function normalizeRegistrationTitle(value: string): string {
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
  sourceCandidateId: string | null;
  targetMasterId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentDetailPageArtifact: { sourceContentGenerationId: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { contentGenerations: number };
}): RegistrationWorkspaceSummary {
  return {
    id: row.id,
    ownerType: row.ownerType,
    sourceCandidateId: row.sourceCandidateId,
    targetMasterId: row.targetMasterId,
    displayName: row.displayName,
    normalizedTitle: row.normalizedTitle,
    status: row.status,
    href: registeredWorkspaceHref(row.id),
    generationCount: row._count?.contentGenerations ?? 0,
    latestGenerationId: null,
    latestStatus: null,
    currentDetailPageArtifactId: row.currentDetailPageArtifactId,
    currentDetailPageRevisionId: row.currentDetailPageRevisionId,
    currentDetailPageGenerationId: row.currentDetailPageArtifact?.sourceContentGenerationId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: [],
  };
}

function workspaceInclude() {
  return {
    currentDetailPageArtifact: {
      select: {
        id: true,
        currentRevisionId: true,
        title: true,
        sourceContentGenerationId: true,
      },
    },
    currentDetailPageRevision: {
      select: { id: true, revisionType: true, createdAt: true },
    },
    _count: { select: { contentGenerations: true } },
    contentGenerations: {
      where: { isDeleted: false },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        contentType: true,
        status: true,
        generatedTitle: true,
        templateId: true,
        generationInput: true,
        generationResult: true,
        detailPageArtifactId: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  };
}

function displayTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120) || '상세페이지 작업';
}

function ownerTypeFor(input: {
  sourceCandidateId: string | null;
  targetMasterId: string | null;
}): string {
  if (input.targetMasterId) return 'master_product';
  if (input.sourceCandidateId) return 'sourcing_candidate';
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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002';
}
