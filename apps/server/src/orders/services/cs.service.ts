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
    organizationId: string,
  ) {
    const { page, limit, skip } = paginationParams(query);

    const where = {
      organizationId,
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
        where: { organizationId },
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
      listingId?: string;
      /** @deprecated Legacy frontend alias — Transform 이 listingId 로 이미 복사. Plan D 이후 제거 예정. */
      productId?: string;
    },
    organizationId: string,
  ) {
    // DTO @Transform 이 이미 listingId 로 매핑하지만, service 레벨에서도
    // 방어적 resolve (Transform 미동작 시나리오·testing 대비).
    const resolvedListingId = data.listingId ?? data.productId ?? null;
    return this.prisma.cSRecord.create({
      data: {
        organizationId,
        csType: data.csType,
        content: data.content,
        priority: data.priority ?? 'normal',
        assignee: data.assignee || null,
        orderId: data.orderId || null,
        listingId: resolvedListingId,
        csStatus: '접수',
      },
    });
  }
}
