import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import type { OrderReturn, OrderReturnLineItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OrderReturnWithLineItems = OrderReturn & {
  lineItems: OrderReturnLineItem[];
};

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: { from?: string; to?: string; type?: string },
  ): Promise<{
    items: OrderReturnWithLineItems[];
    total: number;
    type: string;
  }> {
    const type = query.type || 'return';

    const where: Record<string, unknown> = {
      organizationId,
      type: type === 'exchange' ? 'EXCHANGE' : 'RETURN',
    };

    if (query.from || query.to) {
      const from = query.from
        ? new Date(query.from)
        : new Date(Date.now() - 30 * 86400000);
      const to = query.to ? new Date(query.to) : new Date();
      where.requestedAt = { gte: from, lte: to };
    }

    const data = await this.prisma.orderReturn.findMany({
      where,
      include: { lineItems: true },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      items: data,
      total: data.length,
      type,
    };
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<OrderReturnWithLineItems> {
    const ret = await this.prisma.orderReturn.findFirst({
      where: { id, organizationId },
      include: { lineItems: true },
    });
    if (!ret) throw new NotFoundException('OrderReturn not found');
    return ret;
  }

  async getStats(organizationId: string): Promise<{
    stats: { total: number; uc: number; rc: number; completed: number };
  }> {
    const [total, uc, rc, completed, returnsCompleted] = await Promise.all([
      this.prisma.orderReturn.count({ where: { organizationId } }),
      this.prisma.orderReturn.count({ where: { organizationId, status: 'UC' } }),
      this.prisma.orderReturn.count({ where: { organizationId, status: 'RC' } }),
      this.prisma.orderReturn.count({
        where: { organizationId, status: 'COMPLETED' },
      }),
      this.prisma.orderReturn.count({
        where: { organizationId, status: 'RETURNS_COMPLETED' },
      }),
    ]);

    return {
      stats: { total, uc, rc, completed: completed + returnsCompleted },
    };
  }

  async approve(
    _receiptId: number,
    _organizationId: string,
  ): Promise<{ message: string; data: unknown }> {
    throw new NotImplementedException('쿠팡 반품 승인은 지원하지 않습니다. 쿠팡 Wing에서 처리해 주세요.');
  }
}
