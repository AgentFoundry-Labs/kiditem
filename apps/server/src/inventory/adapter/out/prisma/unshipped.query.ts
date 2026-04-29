import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export type UnshippedItemRow = Prisma.UnshippedItemGetPayload<{}>;

@Injectable()
export class UnshippedQuery {
  constructor(private readonly prisma: PrismaService) {}

  async listUnshipped(
    companyId: string,
    minDays: number,
    skip: number,
    take: number,
  ): Promise<{ items: UnshippedItemRow[]; total: number; delayedCount: number }> {
    const where: Prisma.UnshippedItemWhereInput = {
      companyId,
      ...(minDays > 0 ? { delayDays: { gte: minDays } } : {}),
    };

    const [items, total, delayedCount] = await Promise.all([
      this.prisma.unshippedItem.findMany({
        where,
        orderBy: { delayDays: 'desc' },
        skip,
        take,
      }),
      this.prisma.unshippedItem.count({ where }),
      this.prisma.unshippedItem.count({
        where: { companyId, delayDays: { gte: 3 } },
      }),
    ]);

    return { items, total, delayedCount };
  }
}
