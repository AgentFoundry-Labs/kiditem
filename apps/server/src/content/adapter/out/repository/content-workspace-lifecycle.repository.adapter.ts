import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
import { DetailPageRevisionTypeSchema } from '../../../domain/detail-page/detail-page-revision-type';

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
  ): Promise<{ id: string }> {
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
        // 제목으로 중복을 막는 것은 직접 상세 작업공간뿐이다(판매 상품 작업공간은 상품 하나에 하나).
        ownerType: 'direct_detail_page',
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
        normalizedTitle: true,
        status: true,
        currentDetailPageRevisionId: true,
        currentThumbnailSelectionId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { detailPages: { where: { isDeleted: false } } } },
        currentDetailPageRevision: {
          select: { id: true, detailPageId: true, revisionType: true, createdAt: true },
        },
        currentThumbnailSelection: {
          select: {
            id: true,
            contentAsset: { select: { id: true, url: true } },
          },
        },
      },
    }).then((row) => (row ? toWorkspaceSnapshot(row as unknown as WorkspaceRecord) : null));
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
    }).then((row) => (row ? toWorkspaceSnapshot(row) : null));
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
      rows: rows.map(toWorkspaceSnapshot),
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
}

const workspaceIdentitySelect = {
  id: true,
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
  const hasTitle = input.normalizedTitle !== null;
  // 판매 상품 작업공간은 리스팅을 갖지 않는다 — 리스팅은 상품을 거쳐 작업공간에 닿는다(KID-313 W3).
  const valid = input.ownerType === 'sales_product'
    ? hasSalesProduct && !hasListing && !hasTitle
    : input.ownerType === 'channel_listing'
      ? !hasSalesProduct && hasListing && !hasTitle
      : !hasSalesProduct && !hasListing && hasTitle;
  if (!valid) {
    throw new BadRequestException('Content workspace owner fields do not match ownerType.');
  }
}

/**
 * Every owner a workspace can name is checked through its owner's capability —
 * the draft and the listing through Channels.
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
}

/**
 * 되살려 쓸 작업공간. 초안 작업공간은 판매상품 하나에 하나뿐이라(`content_workspaces_sales_product_active_key`)
 * 이름으로 찾지 않는다 — 초안 이름을 바꾼 뒤에도 같은 작업공간이다.
 */
function activeWorkspaceWhere(input: EnsureContentWorkspaceInput): Prisma.ContentWorkspaceWhereInput {
  return {
    organizationId: input.organizationId,
    ownerType: input.ownerType,
    ...(input.ownerType === 'direct_detail_page' ? { normalizedTitle: input.normalizedTitle } : {}),
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

type WorkspaceRecord = Prisma.ContentWorkspaceGetPayload<{ include: ReturnType<typeof workspaceInclude> }>;

/** revision 종류는 정한 목록 안의 값만 읽는다 — 목록 밖의 값은 writer 가 깨진 것이다. */
function toWorkspaceSnapshot(row: Pick<WorkspaceRecord, 'currentDetailPageRevision'>): ContentWorkspaceSnapshot {
  const revision = row.currentDetailPageRevision;
  return {
    ...row,
    currentDetailPageRevision: revision
      ? { ...revision, revisionType: DetailPageRevisionTypeSchema.parse(revision.revisionType) }
      : null,
  } as unknown as ContentWorkspaceSnapshot;
}

function workspaceInclude() {
  return {
    currentDetailPageRevision: {
      select: { id: true, detailPageId: true, revisionType: true, createdAt: true },
    },
    currentThumbnailSelection: {
      select: {
        id: true,
        contentAsset: { select: { id: true, url: true } },
      },
    },
    _count: { select: { detailPages: { where: { isDeleted: false } } } },
    detailPages: {
      where: { isDeleted: false },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        source: true,
        status: true,
        title: true,
        templateId: true,
        generationInput: true,
        generationResult: true,
        errorMessage: true,
        currentRevisionId: true,
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
