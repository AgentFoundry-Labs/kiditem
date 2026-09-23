import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import {
  SALES_PRODUCT_OWNER_READ_PORT,
  type SalesProductOwnerReadPort,
} from '../../../application/port/out/cross-domain/sales-product-owner.port';
import type {
  ContentWorkspaceLifecycleRepositoryPort,
  ContentWorkspaceListInput,
  ContentWorkspaceSnapshot,
  EnsureContentWorkspaceInput,
} from '../../../application/port/out/repository/content-workspace-lifecycle.repository.port';

@Injectable()
export class ContentWorkspaceLifecycleRepositoryAdapter
implements ContentWorkspaceLifecycleRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
    @Inject(SALES_PRODUCT_OWNER_READ_PORT)
    private readonly salesProductOwners: SalesProductOwnerReadPort,
  ) {}

  async ensureActiveWorkspace(
    input: EnsureContentWorkspaceInput,
  ): Promise<{ id: string; displayName: string; normalizedTitle: string }> {
    assertValidOwnerShape(input);
    const where = activeWorkspaceWhere(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await validateOwnerReferences(tx, input, this.channelListings, this.salesProductOwners);
        const existing = await findActiveWorkspace(tx, where);
        if (existing) return existing;
        return tx.contentWorkspace.create({
          data: {
            organizationId: input.organizationId,
            ownerType: input.ownerType,
            salesProductId: input.salesProductId,
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
        await validateOwnerReferences(tx, input, this.channelListings, this.salesProductOwners);
        return findActiveWorkspace(tx, where);
      });
      if (!raced) throw error;
      return raced;
    }
  }

  async findActiveSalesProductWorkspaceId(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<string | null> {
    const row = await this.prisma.contentWorkspace.findFirst({
      where: {
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        salesProductId: input.salesProductId,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });
    return row?.id ?? null;
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
        salesProductId: true,
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
      // 이 목록은 초안이 아닌 작업공간이다. 빼는 목록이 아니라 넣는 목록이라야
      // 024 가 옮기지 못한 보관 줄(legacy `sourcing_candidate`)이 섞이지 않는다.
      ownerType: { in: ['channel_listing', 'direct_detail_page'] },
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
  const hasSalesProduct = input.salesProductId !== null;
  const hasListing = input.channelListingId !== null;
  const hasOrigin = input.originWorkspaceId !== null;
  // A draft workspace gains its listing through `attachToListing`, never at creation.
  const valid = input.ownerType === 'sales_product'
    ? hasSalesProduct && !hasListing && !hasOrigin
    : input.ownerType === 'channel_listing'
      ? !hasSalesProduct && hasListing
      : !hasSalesProduct && !hasListing && !hasOrigin;
  if (!valid) {
    throw new BadRequestException('Content workspace owner fields do not match ownerType.');
  }
}

/**
 * Every owner a workspace can name is checked through its owner's capability —
 * the draft and the listing through Channels, the origin workspace through AI's
 * own locked row.
 */
async function validateOwnerReferences(
  tx: Prisma.TransactionClient,
  input: EnsureContentWorkspaceInput,
  channelListings: ChannelListingQueryPort,
  salesProductOwners: SalesProductOwnerReadPort,
): Promise<void> {
  if (input.ownerType === 'direct_detail_page') return;
  if (input.ownerType === 'sales_product') {
    // The workspace names its draft by id with no foreign key, so Channels — not
    // a join — is what stops a request opening a workspace on an invented UUID.
    await salesProductOwners.assertOwner({
      organizationId: input.organizationId,
      salesProductId: input.salesProductId!,
    });
    return;
  }

  await channelListings.lockActiveOwner(ownerTransaction(tx), {
    organizationId: input.organizationId,
    listingId: input.channelListingId!,
  });
  if (!input.originWorkspaceId) return;
  const originRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_workspaces
    WHERE id = ${input.originWorkspaceId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND owner_type = 'sales_product'
      AND status = 'active'
      AND is_deleted = false
    FOR UPDATE
  `);
  if (originRows.length !== 1) {
    throw new NotFoundException('Origin content workspace not found.');
  }
}

/**
 * 되살려 쓸 작업공간. 초안 작업공간은 판매상품 하나에 하나뿐이라(`content_workspaces_sales_product_active_key`)
 * 이름으로 찾지 않는다 — 초안 이름을 바꾼 뒤에도 같은 작업공간이다.
 */
function activeWorkspaceWhere(input: EnsureContentWorkspaceInput): Prisma.ContentWorkspaceWhereInput {
  return {
    organizationId: input.organizationId,
    ownerType: input.ownerType,
    ...(input.ownerType === 'sales_product' ? {} : { normalizedTitle: input.normalizedTitle }),
    status: 'active',
    isDeleted: false,
    ...(input.ownerType === 'sales_product'
      ? { salesProductId: input.salesProductId }
      : input.ownerType === 'channel_listing'
        ? { channelListingId: input.channelListingId }
        : {
            salesProductId: null,
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
