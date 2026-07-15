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
    const references = await this.prisma.channelSkuComponent.findMany({
      where: {
        organizationId,
        masterProduct: { organizationId },
      },
      select: { masterProduct: { select: { code: true } } },
      orderBy: [{ masterProduct: { code: 'asc' } }, { id: 'asc' }],
    });
    return [...new Set(references.map(({ masterProduct }) => masterProduct.code))];
  }
}
