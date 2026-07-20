import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ConfirmedChannelComponentReferencePort,
} from '../../../application/port/out/cross-domain/confirmed-channel-component-reference.port';

@Injectable()
export class ConfirmedChannelComponentReferenceRepositoryAdapter
implements ConfirmedChannelComponentReferencePort {
  constructor(private readonly prisma: PrismaService) {}

  async listReferencedSellpiaProductCodes(
    organizationId: string,
  ): Promise<string[]> {
    const references = await this.prisma.productVariantComponent.findMany({
      where: {
        organizationId,
        productVariant: { organizationId },
        sellpiaInventorySku: { organizationId },
      },
      select: { sellpiaInventorySku: { select: { code: true } } },
      orderBy: [{ sellpiaInventorySku: { code: 'asc' } }, { id: 'asc' }],
    });
    return [...new Set(
      references.map(({ sellpiaInventorySku }) => sellpiaInventorySku.code),
    )];
  }
}
