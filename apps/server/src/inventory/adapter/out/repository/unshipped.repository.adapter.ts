import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ListUnshippedRepositoryInput,
  UnshippedItemRow,
  UnshippedRepositoryPort,
} from '../../../application/port/out/repository/unshipped.repository.port';

@Injectable()
export class UnshippedRepositoryAdapter implements UnshippedRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    input: ListUnshippedRepositoryInput,
  ): Promise<{ items: UnshippedItemRow[]; total: number; delayedCount: number }> {
    const where: Prisma.UnshippedItemWhereInput = {
      organizationId,
      ...(input.minDays > 0 ? { delayDays: { gte: input.minDays } } : {}),
    };

    const [items, total, delayedCount] = await Promise.all([
      this.prisma.unshippedItem.findMany({
        where,
        orderBy: { delayDays: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.unshippedItem.count({ where }),
      this.prisma.unshippedItem.count({
        where: { organizationId, delayDays: { gte: 3 } },
      }),
    ]);

    return { items, total, delayedCount };
  }
}
