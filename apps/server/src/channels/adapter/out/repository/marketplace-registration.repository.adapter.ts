import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MarketplaceRegistrationRepositoryPort } from '../../../application/port/out/repository/channel-listing.repository.port';

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter
  implements MarketplaceRegistrationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: string }> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        status: 'active',
      },
      select: { channel: true },
    });
    if (!account) throw new NotFoundException('Marketplace account not found.');
    return account;
  }

  async resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      externalListingId: string;
      displayName: string;
    },
  ) {
    const tx = transaction as Prisma.TransactionClient;
    const externalId = input.externalListingId.trim();
    if (!externalId) throw new BadRequestException('Marketplace listing identity is required.');
    const [account, candidate] = await Promise.all([
      tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          status: 'active',
        },
        select: { id: true, channel: true },
      }),
      tx.sourcingCandidate.findFirst({
        where: {
          id: input.sourceCandidateId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Marketplace account not found.');
    if (!candidate) throw new NotFoundException('Sourcing candidate not found.');

    const existing = await tx.channelListing.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: account.id,
        externalId,
      },
      select: {
        id: true,
        sourceCandidateId: true,
        channelAccountId: true,
        channelAccount: { select: { channel: true } },
        externalId: true,
        status: true,
      },
    });
    if (existing?.sourceCandidateId && existing.sourceCandidateId !== candidate.id) {
      throw new ConflictException('Marketplace listing already belongs to another source candidate.');
    }
    if (!existing) {
      const created = await tx.channelListing.create({
        data: {
          organizationId: input.organizationId,
          sourceCandidateId: candidate.id,
          channelAccountId: account.id,
          externalId,
          displayName: input.displayName,
          status: 'active',
          isActive: true,
        },
        select: {
          id: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          externalId: true,
          status: true,
        },
      });
      return {
        listingId: created.id,
        channelAccountId: created.channelAccountId!,
        channel: created.channelAccount.channel,
        externalId: created.externalId,
        status: created.status,
      };
    }

    const updated = await tx.channelListing.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        OR: [
          { sourceCandidateId: null },
          { sourceCandidateId: candidate.id },
        ],
      },
      data: {
        sourceCandidateId: candidate.id,
        displayName: input.displayName,
        status: 'active',
        isActive: true,
      },
    });
    if (updated.count !== 1) throw new ConflictException('Marketplace listing changed concurrently.');
    const listing = await tx.channelListing.findFirst({
      where: { id: existing.id, organizationId: input.organizationId },
      select: {
        id: true,
        channelAccountId: true,
        channelAccount: { select: { channel: true } },
        externalId: true,
        status: true,
      },
    });
    if (!listing?.channelAccountId) throw new ConflictException('Marketplace listing account is missing.');
    return {
      listingId: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      externalId: listing.externalId,
      status: listing.status,
    };
  }

}
