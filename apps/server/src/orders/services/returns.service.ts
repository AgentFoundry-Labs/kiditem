import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderReturn, OrderReturnLineItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { approveReturn } from '../../channels/adapters/coupang/orders';

type OrderReturnWithLineItems = OrderReturn & {
  lineItems: OrderReturnLineItem[];
};

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: { from?: string; to?: string; type?: string },
  ): Promise<{
    items: OrderReturnWithLineItems[];
    total: number;
    type: string;
  }> {
    const type = query.type || 'return';

    const where: Record<string, unknown> = {
      companyId,
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
    companyId: string,
  ): Promise<OrderReturnWithLineItems> {
    const ret = await this.prisma.orderReturn.findFirst({
      where: { id, companyId },
      include: { lineItems: true },
    });
    if (!ret) throw new NotFoundException('OrderReturn not found');
    return ret;
  }

  async getStats(companyId: string): Promise<{
    stats: { total: number; uc: number; rc: number; completed: number };
  }> {
    const [total, uc, rc, completed, returnsCompleted] = await Promise.all([
      this.prisma.orderReturn.count({ where: { companyId } }),
      this.prisma.orderReturn.count({ where: { companyId, status: 'UC' } }),
      this.prisma.orderReturn.count({ where: { companyId, status: 'RC' } }),
      this.prisma.orderReturn.count({
        where: { companyId, status: 'COMPLETED' },
      }),
      this.prisma.orderReturn.count({
        where: { companyId, status: 'RETURNS_COMPLETED' },
      }),
    ]);

    return {
      stats: { total, uc, rc, completed: completed + returnsCompleted },
    };
  }

  async approve(receiptId: number): Promise<{ message: string; data: unknown }> {
    const result = await approveReturn(receiptId);
    return { message: '반품 승인 완료', data: result };
  }
}
