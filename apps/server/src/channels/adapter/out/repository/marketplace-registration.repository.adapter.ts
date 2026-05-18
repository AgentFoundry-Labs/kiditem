import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MarketplaceRegistrationRepositoryPort,
  RegisterConfirmedListingInput,
} from '../../../application/port/out/channel-listing.repository.port';

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter
  implements MarketplaceRegistrationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedListingInput,
  ) {
    const externalId = input.externalId.trim();
    if (!externalId) throw new BadRequestException('마켓 상품번호를 입력하세요.');

    return this.prisma.$transaction(async (tx) => {
      const [account, master] = await Promise.all([
        tx.channelAccount.findFirst({
          where: { id: input.channelAccountId, organizationId, status: 'active' },
          select: { id: true, channel: true },
        }),
        tx.masterProduct.findFirst({
          where: { id: input.masterId, organizationId, isDeleted: false },
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
      if (existing) {
        return tx.channelListing.update({
          where: { id: existing.id },
          data,
        });
      }
      return tx.channelListing.create({
        data: {
          organizationId,
          ...data,
        },
      });
    });
  }
}
