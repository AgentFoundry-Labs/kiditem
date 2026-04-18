import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationParams } from '../../common/pagination';
import { ListUnshippedQueryDto } from '../dto';

@Injectable()
export class UnshippedService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUnshippedQueryDto, companyId: string) {
    const { page, limit, skip } = paginationParams(query);
    const minDays = query.minDays ?? 0;

    const where = {
      companyId,
      ...(minDays > 0 ? { delayDays: { gte: minDays } } : {}),
    };

    const [items, total, delayedCount] = await Promise.all([
      this.prisma.unshippedItem.findMany({
        where,
        orderBy: { delayDays: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.unshippedItem.count({ where }),
      this.prisma.unshippedItem.count({
        where: { companyId, delayDays: { gte: 3 } },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      summary: { total, delayed: delayedCount },
    };
  }
}
