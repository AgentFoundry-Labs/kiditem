import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationParams } from '../../common/pagination';

@Injectable()
export class UnshippedService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      select: { id: true },
    });
    return company?.id ?? '';
  }

  async findAll(query: {
    page?: string;
    limit?: string;
    minDays?: string;
  }) {
    const companyId = await this.getCompanyId();
    if (!companyId) {
      return { items: [], total: 0, page: 1, limit: 50, summary: { total: 0, delayed: 0 } };
    }

    const { page, limit, skip } = paginationParams(query);
    const minDays = parseInt(query.minDays || '0');

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
