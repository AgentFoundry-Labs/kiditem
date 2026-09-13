import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  readOrderReturnByIdFact,
  readOrderReturns,
  readOrderReturnStatusCounts,
  type OrderReturnFact,
} from '../read/order-facts.reader';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: { from?: string; to?: string; type?: string },
  ): Promise<{
    items: OrderReturnFact[];
    total: number;
    type: string;
  }> {
    const type = query.type || 'return';

    let from: Date | undefined;
    let to: Date | undefined;
    if (query.from || query.to) {
      from = query.from
        ? new Date(query.from)
        : new Date(Date.now() - 30 * 86400000);
      to = query.to ? new Date(query.to) : new Date();
    }

    const data = await this.prisma.$transaction((tx) =>
      readOrderReturns(tx, {
        organizationId,
        type: type === 'exchange' ? 'EXCHANGE' : 'RETURN',
        from,
        to,
      }),
    );

    return {
      items: data,
      total: data.length,
      type,
    };
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<OrderReturnFact> {
    const ret = await this.prisma.$transaction((tx) =>
      readOrderReturnByIdFact(tx, organizationId, id),
    );
    if (!ret) throw new NotFoundException('OrderReturn not found');
    return ret;
  }

  async getStats(organizationId: string): Promise<{
    stats: { total: number; uc: number; rc: number; completed: number };
  }> {
    const counts = await this.prisma.$transaction((tx) =>
      readOrderReturnStatusCounts(tx, organizationId),
    );

    return {
      stats: {
        total: counts.total,
        uc: counts.byStatus.UC ?? 0,
        rc: counts.byStatus.RC ?? 0,
        completed:
          (counts.byStatus.COMPLETED ?? 0) + (counts.byStatus.RETURNS_COMPLETED ?? 0),
      },
    };
  }

  async approve(
    _receiptId: number,
    _organizationId: string,
  ): Promise<{ message: string; data: unknown }> {
    throw new NotImplementedException('쿠팡 반품 승인은 지원하지 않습니다. 쿠팡 Wing에서 처리해 주세요.');
  }
}
