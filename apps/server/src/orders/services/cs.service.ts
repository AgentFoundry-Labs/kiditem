import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationParams } from '../../common/pagination';

@Injectable()
export class CsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: {
      page?: string | number;
      limit?: string | number;
      csStatus?: string;
    },
    companyId: string,
  ) {
    const { page, limit, skip } = paginationParams(query);

    const where = {
      companyId,
      ...(query.csStatus ? { csStatus: query.csStatus } : {}),
    };

    const [items, total, countByStatus] = await Promise.all([
      this.prisma.cSRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cSRecord.count({ where }),
      this.prisma.cSRecord.groupBy({
        by: ['csStatus'],
        where: { companyId },
        _count: true,
      }),
    ]);

    const statusMap: Record<string, number> = {};
    let totalAll = 0;
    for (const row of countByStatus) {
      statusMap[row.csStatus] = row._count;
      totalAll += row._count;
    }

    return {
      items,
      total,
      page,
      limit,
      summary: {
        total: totalAll,
        '접수': statusMap['접수'] ?? 0,
        '처리중': statusMap['처리중'] ?? 0,
        '완료': statusMap['완료'] ?? 0,
      },
    };
  }

  async create(
    data: {
      csType: string;
      content: string;
      priority?: string;
      assignee?: string;
      orderId?: string;
      productId?: string;
    },
    companyId: string,
  ) {
    return this.prisma.cSRecord.create({
      data: {
        companyId,
        csType: data.csType,
        content: data.content,
        priority: data.priority ?? 'normal',
        assignee: data.assignee || null,
        orderId: data.orderId || null,
        productId: data.productId || null,
        csStatus: '접수',
      },
    });
  }
}
