import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentWorkspaceLifecycleRepositoryPort,
  ContentWorkspaceListInput,
  ContentWorkspaceSnapshot,
  EnsureContentWorkspaceInput,
} from '../../../application/port/out/repository/content-workspace-lifecycle.repository.port';

@Injectable()
export class ContentWorkspaceLifecycleRepositoryAdapter
implements ContentWorkspaceLifecycleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async ensureActiveWorkspace(
    input: EnsureContentWorkspaceInput,
  ): Promise<{ id: string; displayName: string; normalizedTitle: string }> {
    const where = activeWorkspaceWhere(input);
    const existing = await this.prisma.contentWorkspace.findFirst({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        displayName: true,
        normalizedTitle: true,
      },
    });
    if (existing) return existing;

    try {
      return await this.prisma.contentWorkspace.create({
        data: {
          organizationId: input.organizationId,
          ownerType: input.ownerType,
          sourceCandidateId: input.sourceCandidateId,
          targetMasterId: input.targetMasterId,
          displayName: input.displayName,
          normalizedTitle: input.normalizedTitle,
          status: 'active',
          createdByUserId: input.createdByUserId,
        },
        select: {
          id: true,
          displayName: true,
          normalizedTitle: true,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.contentWorkspace.findFirst({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          displayName: true,
          normalizedTitle: true,
        },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  findDuplicateByNormalizedTitle(input: {
    organizationId: string;
    normalizedTitle: string;
  }): Promise<ContentWorkspaceSnapshot | null> {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        organizationId: input.organizationId,
        normalizedTitle: input.normalizedTitle,
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
    }) as Promise<ContentWorkspaceSnapshot | null>;
  }

  getById(input: {
    organizationId: string;
    workspaceId: string;
  }): Promise<ContentWorkspaceSnapshot | null> {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      include: workspaceInclude(),
    }) as Promise<ContentWorkspaceSnapshot | null>;
  }

  async listActive(input: ContentWorkspaceListInput): Promise<{
    total: number;
    rows: ContentWorkspaceSnapshot[];
  }> {
    const where = {
      organizationId: input.organizationId,
      status: input.status,
      isDeleted: false,
      ownerType: { not: 'sourcing_candidate' },
      ...(input.normalizedTitle ? { normalizedTitle: input.normalizedTitle } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentWorkspace.count({ where }),
      this.prisma.contentWorkspace.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: workspaceInclude(),
      }),
    ]);
    return {
      total,
      rows: rows as unknown as ContentWorkspaceSnapshot[],
    };
  }

  async archive(input: {
    organizationId: string;
    workspaceId: string;
    archivedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.contentWorkspace.updateMany({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: {
        status: 'archived',
        isDeleted: true,
        deletedAt: input.archivedAt,
      },
    });
    return result.count;
  }

  findSelectableDetailPageGeneration(input: {
    organizationId: string;
    workspaceId: string;
    contentGenerationId: string;
  }) {
    return this.prisma.contentGeneration.findFirst({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
        contentWorkspaceId: input.workspaceId,
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
  }

  async selectCurrentDetailPage(input: {
    organizationId: string;
    workspaceId: string;
    detailPageArtifactId: string;
    detailPageRevisionId: string | null;
  }): Promise<number> {
    const result = await this.prisma.contentWorkspace.updateMany({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: {
        currentDetailPageArtifactId: input.detailPageArtifactId,
        currentDetailPageRevisionId: input.detailPageRevisionId,
      },
    });
    return result.count;
  }
}

function activeWorkspaceWhere(input: EnsureContentWorkspaceInput): Prisma.ContentWorkspaceWhereInput {
  return {
    organizationId: input.organizationId,
    ownerType: input.ownerType,
    normalizedTitle: input.normalizedTitle,
    status: 'active',
    isDeleted: false,
    ...(input.ownerType === 'sourcing_candidate'
      ? { sourceCandidateId: input.sourceCandidateId }
      : input.ownerType === 'master_product'
        ? { targetMasterId: input.targetMasterId }
        : { sourceCandidateId: null, targetMasterId: null }),
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
  } satisfies Prisma.ContentWorkspaceInclude;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002';
}
