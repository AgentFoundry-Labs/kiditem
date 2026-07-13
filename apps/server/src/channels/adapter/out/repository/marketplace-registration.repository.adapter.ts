import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../common/legacy-family-master-scope';
import type {
  MarketplaceRegistrationRepositoryPort,
  RegisteredMarketplaceListingResult,
  RegisterConfirmedListingInput,
} from '../../../application/port/out/repository/channel-listing.repository.port';

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter
  implements MarketplaceRegistrationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertLegacyFamilyMaster(
    organizationId: string,
    masterId: string,
  ): Promise<void> {
    const master = await this.prisma.masterProduct.findFirst({
      where: {
        id: masterId,
        organizationId,
        isDeleted: false,
        ...LEGACY_FAMILY_MASTER_SCOPE,
      },
      select: { id: true },
    });
    if (!master) throw new NotFoundException('재고 상품을 찾을 수 없습니다.');
  }

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
        channel: true,
        channelAccountId: true,
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
          masterId: null,
          sourceCandidateId: candidate.id,
          channelAccountId: account.id,
          channel: account.channel,
          externalId,
          displayName: input.displayName,
          status: 'active',
          isActive: true,
          isDeleted: false,
        },
        select: {
          id: true,
          channel: true,
          channelAccountId: true,
          externalId: true,
          status: true,
        },
      });
      return {
        listingId: created.id,
        channelAccountId: created.channelAccountId!,
        channel: created.channel,
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
        isDeleted: false,
        deletedAt: null,
      },
    });
    if (updated.count !== 1) throw new ConflictException('Marketplace listing changed concurrently.');
    const listing = await tx.channelListing.findFirst({
      where: { id: existing.id, organizationId: input.organizationId },
      select: {
        id: true,
        channel: true,
        channelAccountId: true,
        externalId: true,
        status: true,
      },
    });
    if (!listing?.channelAccountId) throw new ConflictException('Marketplace listing account is missing.');
    return {
      listingId: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channel,
      externalId: listing.externalId,
      status: listing.status,
    };
  }

  async registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedListingInput,
  ): Promise<RegisteredMarketplaceListingResult> {
    const externalId = input.externalId.trim();
    if (!externalId) throw new BadRequestException('마켓 상품번호를 입력하세요.');

    return this.prisma.$transaction(async (tx) => {
      const [account, master] = await Promise.all([
        tx.channelAccount.findFirst({
          where: { id: input.channelAccountId, organizationId, status: 'active' },
          select: { id: true, channel: true },
        }),
        tx.masterProduct.findFirst({
          where: {
            id: input.masterId,
            organizationId,
            isDeleted: false,
            ...LEGACY_FAMILY_MASTER_SCOPE,
          },
          select: { id: true, name: true },
        }),
      ]);
      if (!account) throw new NotFoundException('마켓 계정을 찾을 수 없습니다.');
      if (!master) throw new NotFoundException('재고 상품을 찾을 수 없습니다.');

      const existing = await tx.channelListing.findFirst({
        where: {
          organizationId,
          channelAccountId: account.id,
          externalId,
          isDeleted: false,
        },
        select: { id: true },
      });
      const data = {
        masterId: master.id,
        channel: account.channel,
        channelAccountId: account.id,
        externalId,
        channelName: input.channelName?.trim() || master.name,
        channelPrice: input.channelPrice ?? null,
        status: 'active',
        isDeleted: false,
        deletedAt: null,
      };
      const listing = existing
        ? await tx.channelListing.update({
            where: { id: existing.id },
            data,
          })
        : await tx.channelListing.create({
            data: {
              organizationId,
              ...data,
            },
          });

      return {
        id: listing.id,
        masterId: master.id,
        channel: listing.channel,
        channelAccountId: listing.channelAccountId,
        externalId: listing.externalId,
        channelName: listing.channelName,
        channelPrice: listing.channelPrice,
        status: listing.status,
      };
    });
  }
}
