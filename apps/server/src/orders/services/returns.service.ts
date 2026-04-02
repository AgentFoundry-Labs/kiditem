import { Injectable } from '@nestjs/common';
import type { CoupangReturn, CoupangReturnItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { approveReturn } from '../../channels/adapters/coupang/orders';

type CoupangReturnWithItems = CoupangReturn & { returnItems: CoupangReturnItem[] };

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { from?: string; to?: string; type?: string }): Promise<{
    items: CoupangReturnWithItems[];
    total: number;
    type: string;
  }> {
    const type = query.type || 'return';

    const where: Record<string, unknown> = {
      receiptType: type === 'exchange' ? 'EXCHANGE' : 'RETURN',
    };

    if (query.from || query.to) {
      const from = query.from
        ? new Date(query.from)
        : new Date(Date.now() - 30 * 86400000);
      const to = query.to ? new Date(query.to) : new Date();
      where.requestedAt = { gte: from, lte: to };
    }

    const data = await this.prisma.coupangReturn.findMany({
      where,
      include: { returnItems: true },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      items: data,
      total: data.length,
      type,
    };
  }

  async findOne(id: string): Promise<CoupangReturnWithItems | null> {
    return this.prisma.coupangReturn.findUnique({
      where: { id },
      include: { returnItems: true },
    });
  }

  async getStats(): Promise<{
    stats: { total: number; uc: number; rc: number; completed: number };
  }> {
    const [total, uc, rc, completed, returnsCompleted] = await Promise.all([
      this.prisma.coupangReturn.count(),
      this.prisma.coupangReturn.count({ where: { receiptStatus: 'UC' } }),
      this.prisma.coupangReturn.count({ where: { receiptStatus: 'RC' } }),
      this.prisma.coupangReturn.count({
        where: { receiptStatus: 'COMPLETED' },
      }),
      this.prisma.coupangReturn.count({
        where: { receiptStatus: 'RETURNS_COMPLETED' },
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
