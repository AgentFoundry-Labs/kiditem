import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingDeletionTarget,
  ChannelListingDeletionAuthorizationInput,
  ChannelListingDeletionExecutionClaim,
  ChannelListingDeletionCompletionInput,
  ChannelListingDeletionOperationLookup,
  ChannelListingDeletionOperationResult,
  ChannelListingDeletionOperationStatus,
  ChannelListingDeletionUnresolvedInput,
  ChannelListingDeletionUnresolvedResult,
  ChannelListingListResult,
  ChannelListingQuery,
  ChannelListingRepositoryPort,
  ChannelListingSummary,
} from '../../../application/port/out/repository/channel-listing.repository.port';
import { lockChannelListingRow } from './channel-listing-row-lock';

const listingInclude = {
  channelAccount: {
    select: { id: true, channel: true, name: true },
  },
  options: {
    where: { isActive: true },
    select: {
      productVariantId: true,
      salePrice: true,
      productVariant: {
        select: {
          components: {
            select: { sellpiaInventorySku: { select: { isActive: true } } },
          },
        },
      },
    },
  },
  contentWorkspaces: {
    where: { status: 'active', isDeleted: false },
    take: 1,
    select: {
      id: true,
      currentDetailPageArtifactId: true,
      currentDetailPageRevisionId: true,
      currentThumbnailSelection: {
        select: { contentAsset: { select: { url: true } } },
      },
    },
  },
  thumbnails: {
    where: { status: 'active' },
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
    select: { imageUrl: true },
  },
} satisfies Prisma.ChannelListingInclude;

type ListingRow = Prisma.ChannelListingGetPayload<{ include: typeof listingInclude }>;

function parseQueryDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class ChannelListingRepositoryAdapter implements ChannelListingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: ChannelListingQuery = {},
  ): Promise<ChannelListingListResult> {
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(100, positiveInteger(query.limit, 20));
    const search = query.search?.trim();
    const includeInactive = query.includeDeleted ?? query.tab === 'deleted';
    const createdSince = parseQueryDate(query.createdSince);
    const where: Prisma.ChannelListingWhereInput = {
      organizationId,
      isActive: !includeInactive,
      ...(query.channel
        ? { channelAccount: { is: { organizationId, channel: query.channel } } }
        : {}),
      ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
      ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
      ...(search
        ? {
            OR: [
              { externalId: contains(search) },
              { channelName: contains(search) },
              { displayName: contains(search) },
              { options: { some: { itemName: contains(search) } } },
              { options: { some: { sellerSku: contains(search) } } },
            ],
          }
        : {}),
    };
    /**
     * 등록 최신순은 `createdAt` 기준이다.
     *
     * 예전에는 `updatedAt` 으로 정렬했는데, 카탈로그 재수집(`channel-catalog-identity-upsert`)이
     * 배치 전체의 `updated_at` 을 NOW() 로 갱신한다. 그래서 새로 등록한 상품이 없어도
     * 목록 순서가 통째로 뒤섞였고, "최종 등록일 최신순" 이라는 라벨과도 맞지 않았다.
     * 등록 시점은 `createdAt` 만이 안정적으로 보존한다.
     */
    const orderBy: Prisma.ChannelListingOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : query.sort === 'name_asc'
          ? [{ displayName: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [total, rows, groupedCounts, accounts] = await this.prisma.$transaction([
      this.prisma.channelListing.count({ where }),
      this.prisma.channelListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: listingInclude,
      }),
      this.prisma.channelListing.groupBy({
        by: ['channelAccountId'],
        where: { organizationId, isActive: !includeInactive },
        orderBy: { channelAccountId: 'asc' },
        _count: { id: true },
      }),
      this.prisma.channelAccount.findMany({
        where: { organizationId },
        select: { id: true, channel: true, name: true },
      }),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    return {
      items: rows.map(toSummary),
      total,
      page,
      limit,
      marketCounts: groupedCounts.map((group) => {
        const account = accountById.get(group.channelAccountId);
        return {
          channel: account?.channel ?? 'unknown',
          channelAccountId: group.channelAccountId,
          channelAccountName: account?.name ?? null,
          count: typeof group._count === 'object' && group._count
            ? group._count.id ?? 0
            : 0,
        };
      }),
    };
  }

  async getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isActive: true },
      include: listingInclude,
    });
    if (!row) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    return toSummary(row);
  }

  async findDeletionTarget(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingDeletionTarget | null> {
    // 단일 리소스 읽기는 { id, organizationId } 스코프다. id 만으로 찾으면 IDOR 이다.
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        channelName: true,
        channelAccountId: true,
        sourceCandidateId: true,
        isActive: true,
        channelAccount: { select: { channel: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      externalId: row.externalId,
      displayName: row.displayName ?? row.channelName,
      channel: row.channelAccount.channel,
      channelAccountId: row.channelAccountId,
      sourceCandidateId: row.sourceCandidateId,
      isActive: row.isActive,
    };
  }

  async authorizeDeletion(
    input: ChannelListingDeletionAuthorizationInput,
  ): Promise<ChannelListingDeletionOperationResult> {
    try {
      return await this.authorizeDeletionOnce(input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent insert may have won the org/key or active-listing key.
      // Re-read it outside the aborted transaction and validate every frozen scope.
      const replay = await this.prisma.channelListingDeletionOperation.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        include: {
          channelListing: {
            select: {
              id: true, displayName: true, channelName: true,
              channelAccount: { select: { channel: true } },
            },
          },
        },
      });
      const active = replay ?? await this.prisma.channelListingDeletionOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          channelListingId: input.listingId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
        },
        include: {
          channelListing: {
            select: {
              id: true, displayName: true, channelName: true,
              channelAccount: { select: { channel: true } },
            },
          },
        },
      });
      if (!active || active.channelListingId !== input.listingId || active.requestHash !== input.requestHash) {
        throw new ConflictException('Deletion operation conflicts with an existing request.');
      }
      assertOperationActor(active.requestedByUserId, input.userId);
      return toAuthorizationResult(active, active.channelListing);
    }
  }

  private async authorizeDeletionOnce(
    input: ChannelListingDeletionAuthorizationInput,
  ): Promise<ChannelListingDeletionOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      // Shared with registration finalization: listing always locks first.
      const locked = await lockChannelListingRow(tx, {
        organizationId: input.organizationId,
        channelListingId: input.listingId,
        activeOnly: false,
        catalogMatchingEligibleOnly: false,
      });
      if (!locked) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');

      const listing = await tx.channelListing.findFirst({
        where: { id: input.listingId, organizationId: input.organizationId },
        select: {
          id: true,
          externalId: true,
          displayName: true,
          channelName: true,
          sourceCandidateId: true,
          isActive: true,
          channelAccountId: true,
          channelAccount: {
            select: {
              channel: true,
              status: true,
              vendorId: true,
              externalAccountId: true,
            },
          },
        },
      });
      if (!listing) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');

      const replay = await tx.channelListingDeletionOperation.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
      });
      if (replay) {
        if (replay.requestHash !== input.requestHash) {
          throw new ConflictException('Deletion idempotency key was reused with a different request.');
        }
        assertOperationActor(replay.requestedByUserId, input.userId);
        return toAuthorizationResult(replay, listing);
      }

      const activeDeletion = await tx.channelListingDeletionOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          channelListingId: input.listingId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
        },
      });
      if (activeDeletion) {
        if (activeDeletion.requestHash !== input.requestHash) {
          throw new ConflictException('Active deletion operation belongs to a different request.');
        }
        assertOperationActor(activeDeletion.requestedByUserId, input.userId);
        return toAuthorizationResult(activeDeletion, listing);
      }

      if (!listing.sourceCandidateId) {
        throw new ForbiddenException('우리가 등록한 상품만 삭제할 수 있습니다.');
      }
      if (!listing.isActive) throw new BadRequestException('이미 삭제된 상품입니다.');
      if (listing.channelAccount.channel !== 'coupang' || listing.channelAccount.status !== 'active') {
        throw new BadRequestException('An active Coupang marketplace account is required.');
      }
      const expectedProviderAccountId = listing.channelAccount.vendorId
        ?? listing.channelAccount.externalAccountId;
      if (!expectedProviderAccountId) {
        throw new BadRequestException('Coupang provider account identity is required.');
      }

      const activeRegistration = await tx.productRegistrationExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: listing.channelAccountId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
          OR: [
            { channelListingId: listing.id },
            { externalListingId: listing.externalId },
          ],
        },
        select: { id: true },
      });
      if (activeRegistration) {
        throw new ConflictException('Marketplace registration is active for this listing.');
      }

      // The listing lock serializes same-listing/same-key requests. A key reused
      // for another listing is rejected by the durable unique constraint.
      const operation = await tx.channelListingDeletionOperation.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: listing.channelAccountId,
          channelListingId: listing.id,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          externalListingId: listing.externalId,
          expectedProviderAccountId,
          requestedByUserId: input.userId,
          // Extension can click only after this durable uncertain side effect state commits.
          status: 'executing',
          providerOutcome: 'uncertain',
          leaseToken: randomUUID(),
          leaseClaimedAt: null,
          authorizationExpiresAt: new Date(Date.now() + 5 * 60_000),
          startedAt: new Date(),
        },
      });
      return toAuthorizationResult(operation, listing);
    });
  }

  async claimDeletionExecution(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<ChannelListingDeletionExecutionClaim> {
    return this.prisma.$transaction(async (tx) => {
      await assertLockedListing(tx, input.organizationId, input.listingId);
      await lockDeletionOperation(tx, input.organizationId, input.operationId);
      const operation = await tx.channelListingDeletionOperation.findFirst({
        where: { id: input.operationId, organizationId: input.organizationId, channelListingId: input.listingId },
        include: { channelListing: { select: { displayName: true, channelName: true } } },
      });
      if (!operation) throw new NotFoundException('Deletion operation not found.');
      assertOperationActor(operation.requestedByUserId, input.userId);
      if (operation.status !== 'executing' || operation.providerOutcome !== 'uncertain'
        || operation.leaseClaimedAt
        || !operation.leaseToken || !operation.authorizationExpiresAt
        || operation.authorizationExpiresAt <= new Date()) {
        throw new ConflictException('Deletion execution capability is unavailable or expired.');
      }
      await tx.channelListingDeletionOperation.update({
        where: { id: operation.id }, data: { leaseClaimedAt: new Date() },
      });
      return {
        operationId: operation.id,
        listingId: operation.channelListingId,
        externalId: operation.externalListingId,
        displayName: operation.channelListing.displayName ?? operation.channelListing.channelName ?? operation.externalListingId,
        expectedVendorId: operation.expectedProviderAccountId,
        executionCapability: operation.leaseToken,
        expiresAt: operation.authorizationExpiresAt.toISOString(),
      };
    });
  }

  async markDeletionUnresolved(
    input: ChannelListingDeletionUnresolvedInput,
  ): Promise<ChannelListingDeletionUnresolvedResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertLockedListing(tx, input.organizationId, input.listingId);
      await lockDeletionOperation(tx, input.organizationId, input.operationId);
      const operation = await tx.channelListingDeletionOperation.findFirst({
        where: { id: input.operationId, organizationId: input.organizationId, channelListingId: input.listingId },
      });
      if (!operation) throw new NotFoundException('Deletion operation not found.');
      assertOperationActor(operation.requestedByUserId, input.userId);
      if (operation.status === 'succeeded') {
        return { operationId: operation.id, status: 'succeeded', providerOutcome: 'succeeded' };
      }
      if (!['executing', 'reconciling'].includes(operation.status)) {
        throw new ConflictException('Deletion operation cannot be reconciled from its current state.');
      }
      await tx.channelListingDeletionOperation.update({
        where: { id: operation.id },
        data: {
          status: 'reconciling',
          providerOutcome: 'uncertain',
          lastErrorCode: input.reason,
          lastErrorMessage: 'Provider deletion outcome requires reconciliation.',
        },
      });
      return { operationId: operation.id, status: 'reconciling', providerOutcome: 'uncertain' };
    });
  }

  async getDeletionOperation(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<ChannelListingDeletionOperationStatus | null> {
    const operation = await this.prisma.channelListingDeletionOperation.findFirst({
      where: {
        id: input.operationId,
        organizationId: input.organizationId,
        channelListingId: input.listingId,
        requestedByUserId: input.userId,
      },
    });
    if (!operation) return null;
    return {
      operationId: operation.id,
      listingId: operation.channelListingId,
      channelAccountId: operation.channelAccountId,
      expectedVendorId: operation.expectedProviderAccountId,
      externalId: operation.externalListingId,
      status: operation.status,
      providerOutcome: operation.providerOutcome,
      completedAt: operation.completedAt?.toISOString() ?? null,
      lastErrorCode: operation.lastErrorCode,
    };
  }

  async completeDeletion(
    input: ChannelListingDeletionCompletionInput,
  ): Promise<ChannelListingDeletionUnresolvedResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertLockedListing(tx, input.organizationId, input.listingId);
      await lockDeletionOperation(tx, input.organizationId, input.operationId);
      const operation = await tx.channelListingDeletionOperation.findFirst({
        where: {
          id: input.operationId,
          organizationId: input.organizationId,
          channelListingId: input.listingId,
        },
      });
      if (!operation) throw new NotFoundException('Deletion operation not found.');
      assertOperationActor(operation.requestedByUserId, input.userId);
      if (operation.status === 'succeeded') {
        return { operationId: operation.id, status: 'succeeded', providerOutcome: 'succeeded' };
      }
      if (!['executing', 'reconciling'].includes(operation.status)) {
        throw new ConflictException('Deletion operation cannot be completed from its current state.');
      }
      if (operation.expectedProviderAccountId !== input.verifiedProviderAccountId
        || operation.externalListingId !== input.verifiedExternalListingId) {
        throw new ConflictException('Verified Coupang deletion does not match the frozen operation.');
      }
      const deactivated = await tx.channelListing.updateMany({
        where: {
          id: input.listingId,
          organizationId: input.organizationId,
          channelAccountId: operation.channelAccountId,
          externalId: operation.externalListingId,
          isActive: true,
        },
        data: { isActive: false, status: 'deleted' },
      });
      if (deactivated.count !== 1) {
        throw new ConflictException('Verified listing could not be deactivated exactly once.');
      }
      await tx.channelListingDeletionOperation.update({
        where: { id: operation.id },
        data: {
          status: 'succeeded',
          providerOutcome: 'succeeded',
          resultJson: {
            source: 'coupang-open-api',
            status: 'DELETED',
            externalListingId: input.verifiedExternalListingId,
            providerAccountId: input.verifiedProviderAccountId,
          },
          lastErrorCode: null,
          lastErrorMessage: null,
          completedAt: new Date(),
        },
      });
      return { operationId: operation.id, status: 'succeeded', providerOutcome: 'succeeded' };
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'P2002';
}

async function assertLockedListing(tx: Prisma.TransactionClient, organizationId: string, listingId: string) {
  const listing = await lockChannelListingRow(tx, {
    organizationId,
    channelListingId: listingId,
    activeOnly: false,
    catalogMatchingEligibleOnly: false,
  });
  if (!listing) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
}

async function lockDeletionOperation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  operationId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM channel_listing_deletion_operations
    WHERE id = ${operationId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

function assertOperationActor(requestedByUserId: string | null, userId: string): void {
  if (!requestedByUserId || requestedByUserId !== userId) {
    throw new ForbiddenException('Deletion operation belongs to another actor.');
  }
}

function toAuthorizationResult(
  operation: {
    id: string; channelListingId: string; channelAccountId: string; externalListingId: string;
    expectedProviderAccountId: string; status: string; providerOutcome: string;
    leaseClaimedAt: Date | null;
  },
  listing: { displayName: string | null; channelName: string | null; channelAccount: { channel: string } },
): ChannelListingDeletionOperationResult {
  if (!['executing', 'reconciling'].includes(operation.status)
    || operation.providerOutcome !== 'uncertain') {
    throw new ConflictException('Deletion operation is no longer eligible for a provider deletion attempt.');
  }
  return {
    operationId: operation.id,
    listingId: operation.channelListingId,
    channelAccountId: operation.channelAccountId,
    externalId: operation.externalListingId,
    displayName: listing.displayName ?? listing.channelName ?? operation.externalListingId,
    channel: listing.channelAccount.channel,
    expectedVendorId: operation.expectedProviderAccountId,
    status: operation.status as 'executing' | 'reconciling',
    providerOutcome: 'uncertain',
    extensionClaimed: operation.leaseClaimedAt !== null,
  };
}


function toSummary(row: ListingRow): ChannelListingSummary {
  const workspace = row.contentWorkspaces[0] ?? null;
  const listingName = row.displayName ?? row.channelName ?? row.externalId;
  return {
    id: row.id,
    listingName,
    thumbnailUrl:
      workspace?.currentThumbnailSelection?.contentAsset.url
      ?? row.thumbnails[0]?.imageUrl
      ?? null,
    detailPageArtifactId: workspace?.currentDetailPageArtifactId ?? null,
    detailPageRevisionId: workspace?.currentDetailPageRevisionId ?? null,
    channel: row.channelAccount.channel,
    channelAccountId: row.channelAccountId,
    channelAccountName: row.channelAccount.name,
    externalId: row.externalId,
    channelName: row.channelName,
    channelPrice: firstPrice(row.options),
    sourceCandidateId: row.sourceCandidateId,
    contentWorkspaceId: workspace?.id ?? null,
    status: row.status,
    exposureStatus: row.exposureStatus,
    optionCount: row.options.length,
    mappingStatus: aggregateMappingStatus(row.masterProductId, row.options),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function contains(value: string) {
  return { contains: value, mode: Prisma.QueryMode.insensitive } as const;
}

function firstPrice(options: Array<{ salePrice: number | null }>): number | null {
  return options.find((option) => option.salePrice !== null)?.salePrice ?? null;
}

function aggregateMappingStatus(
  masterProductId: string | null,
  options: Array<{
    productVariantId: string | null;
    productVariant: null | {
      components: Array<{ sellpiaInventorySku: { isActive: boolean } }>;
    };
  }>,
): 'matched' | 'unmatched' | 'needs_review' {
  if (!masterProductId) return 'unmatched';
  if (options.length === 0) return 'needs_review';
  if (options.some((option) => !option.productVariantId || !option.productVariant)) {
    return 'needs_review';
  }
  if (options.some((option) =>
    option.productVariant!.components.length === 0
    || option.productVariant!.components.some(
      (component) => !component.sellpiaInventorySku.isActive,
    ))) {
    return 'needs_review';
  }
  return 'matched';
}
