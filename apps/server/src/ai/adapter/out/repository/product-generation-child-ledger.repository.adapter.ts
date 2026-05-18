import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductGenerationChildLedgerRepositoryPort,
  ProductGenerationChildLedgerStatuses,
} from '../../../application/port/out/product-generation-child-ledger.repository.port';

@Injectable()
export class ProductGenerationChildLedgerRepositoryAdapter
implements ProductGenerationChildLedgerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async readChildStatuses(input: {
    organizationId: string;
    childIds: {
      detailPageGenerationId: string | null;
      thumbnailGenerationId: string | null;
    };
  }): Promise<ProductGenerationChildLedgerStatuses> {
    const [detail, thumbnail] = await Promise.all([
      input.childIds.detailPageGenerationId
        ? this.prisma.contentGeneration.findFirst({
            where: {
              id: input.childIds.detailPageGenerationId,
              organizationId: input.organizationId,
            },
            select: { status: true },
          })
        : null,
      input.childIds.thumbnailGenerationId
        ? this.prisma.thumbnailGeneration.findFirst({
            where: {
              id: input.childIds.thumbnailGenerationId,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            select: { status: true },
          })
        : null,
    ]);

    return {
      detailPageStatus: detail?.status ?? null,
      thumbnailStatus: thumbnail?.status ?? null,
    };
  }
}
