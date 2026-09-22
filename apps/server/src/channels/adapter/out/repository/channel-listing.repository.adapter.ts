import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingDeletionTarget,
  ChannelListingDeletionOperationLookup,
  ChannelListingDeletionOperationStatus,
  ChannelListingDeletionUnresolvedInput,
  ChannelListingDeletionUnresolvedResult,
  ChannelListingRepositoryPort,
} from '../../../application/port/out/repository/channel-listing.repository.port';
import { lockChannelListingRow } from './channel-listing-row-lock';

@Injectable()
export class ChannelListingRepositoryAdapter implements ChannelListingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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
        salesProduct: { select: { sourceCandidateId: true } },
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
      sourceCandidateId: row.salesProduct?.sourceCandidateId ?? null,
      isActive: row.isActive,
    };
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
}

async function assertLockedListing(tx: Prisma.TransactionClient, organizationId: string, listingId: string) {
  const listing = await lockChannelListingRow(tx, {
    organizationId,
    channelListingId: listingId,
    activeOnly: false,
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
