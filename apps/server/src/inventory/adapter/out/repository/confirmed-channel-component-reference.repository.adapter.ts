import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ConfirmedChannelComponentReferencePort,
} from '../../../application/port/out/cross-domain/confirmed-channel-component-reference.port';
import { readInventorySkuIdentities } from '../../../read/inventory-availability';

@Injectable()
export class ConfirmedChannelComponentReferenceRepositoryAdapter
implements ConfirmedChannelComponentReferencePort {
  constructor(private readonly prisma: PrismaService) {}

  async listReferencedSellpiaProductCodes(
    organizationId: string,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (transaction) => {
      const references = await transaction.channelListingOptionInventoryComponent.findMany({
        where: {
          organizationId,
          channelListingOption: {
            organizationId,
            listing: { organizationId, masterProductId: { not: null } },
          },
        },
        select: { sellpiaInventorySkuId: true },
        orderBy: { id: 'asc' },
      });
      const identities = await readInventorySkuIdentities(transaction, {
        organizationId,
        selector: {
          kind: 'ids',
          values: references.map(({ sellpiaInventorySkuId }) =>
            sellpiaInventorySkuId),
        },
      });
      return [...new Set(identities.map(({ code }) => code))].sort();
    });
  }
}
