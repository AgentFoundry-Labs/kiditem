import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    assertValidOwnerShape(input);
    const where = activeWorkspaceWhere(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await validateOwnerReferences(tx, input);
        const existing = await findActiveWorkspace(tx, where);
        if (existing) return existing;
        return tx.contentWorkspace.create({
          data: {
            organizationId: input.organizationId,
            ownerType: input.ownerType,
            sourceCandidateId: input.sourceCandidateId,
            channelListingId: input.channelListingId,
            originWorkspaceId: input.originWorkspaceId,
            displayName: input.displayName,
            normalizedTitle: input.normalizedTitle,
            status: 'active',
            createdByUserId: input.createdByUserId,
          },
          select: workspaceIdentitySelect,
        });
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.$transaction(async (tx) => {
        await validateOwnerReferences(tx, input);
        return findActiveWorkspace(tx, where);
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
        channelListingId: true,
        originWorkspaceId: true,
        displayName: true,
        normalizedTitle: true,
        status: true,
        currentDetailPageArtifactId: true,
        currentDetailPageRevisionId: true,
        currentThumbnailSelectionId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contentGenerations: true } },
        currentDetailPageArtifact: {
          select: { sourceContentGenerationId: true },
        },
        currentThumbnailSelection: {
          select: {
            id: true,
            contentAsset: { select: { id: true, url: true } },
          },
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

const workspaceIdentitySelect = {
  id: true,
  displayName: true,
  normalizedTitle: true,
} as const;

function findActiveWorkspace(
  tx: Prisma.TransactionClient,
  where: Prisma.ContentWorkspaceWhereInput,
) {
  return tx.contentWorkspace.findFirst({
    where,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: workspaceIdentitySelect,
  });
}

function assertValidOwnerShape(input: EnsureContentWorkspaceInput): void {
  const hasSource = input.sourceCandidateId !== null;
  const hasListing = input.channelListingId !== null;
  const hasOrigin = input.originWorkspaceId !== null;
  const valid = input.ownerType === 'sourcing_candidate'
    ? hasSource && !hasListing && !hasOrigin
    : input.ownerType === 'channel_listing'
      ? !hasSource && hasListing
      : !hasSource && !hasListing && !hasOrigin;
  if (!valid) {
    throw new BadRequestException('Content workspace owner fields do not match ownerType.');
  }
}

async function validateOwnerReferences(
  tx: Prisma.TransactionClient,
  input: EnsureContentWorkspaceInput,
): Promise<void> {
  if (input.ownerType === 'sourcing_candidate') {
    const candidate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM sourcing_candidates
      WHERE id = ${input.sourceCandidateId!}::uuid
        AND organization_id = ${input.organizationId}::uuid
        AND is_deleted = false
      FOR UPDATE
    `);
    if (candidate.length !== 1) {
      throw new NotFoundException('Sourcing candidate owner not found.');
    }
    return;
  }

  if (input.ownerType === 'direct_detail_page') return;

  const listingRows = await tx.$queryRaw<Array<{
    id: string;
    sourceCandidateId: string | null;
  }>>(Prisma.sql`
    SELECT id, source_candidate_id AS "sourceCandidateId"
    FROM channel_listings
    WHERE id = ${input.channelListingId!}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND is_active = true
    FOR UPDATE
  `);
  const listing = listingRows[0];
  if (!listing || listingRows.length !== 1) {
    throw new NotFoundException('Channel listing owner not found.');
  }
  if (!input.originWorkspaceId) return;
  const originRows = await tx.$queryRaw<Array<{
    id: string;
    sourceCandidateId: string | null;
  }>>(Prisma.sql`
    SELECT id, source_candidate_id AS "sourceCandidateId"
    FROM content_workspaces
    WHERE id = ${input.originWorkspaceId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND owner_type = 'sourcing_candidate'
      AND status = 'active'
      AND is_deleted = false
    FOR UPDATE
  `);
  const origin = originRows[0];
  if (!origin || originRows.length !== 1) {
    throw new NotFoundException('Origin content workspace not found.');
  }
  if (!listing.sourceCandidateId || listing.sourceCandidateId !== origin.sourceCandidateId) {
    throw new BadRequestException('Listing and origin workspace source candidates do not match.');
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
      : input.ownerType === 'channel_listing'
        ? { channelListingId: input.channelListingId }
        : {
            sourceCandidateId: null,
            channelListingId: null,
          }),
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
    currentThumbnailSelection: {
      select: {
        id: true,
        contentAsset: { select: { id: true, url: true } },
      },
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
