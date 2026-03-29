import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { approveReturn } from '../coupang/orders';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { from?: string; to?: string; type?: string }) {
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
      success: true,
      data,
      count: data.length,
      type,
    };
  }

  async findOne(id: string) {
    const returnRecord = await this.prisma.coupangReturn.findUnique({
      where: { id },
      include: { returnItems: true },
    });

    return { success: true, data: returnRecord };
  }

  async getStats() {
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
      success: true,
      stats: { total, uc, rc, completed: completed + returnsCompleted },
    };
  }

  async approve(receiptId: number) {
    const result = await approveReturn(receiptId);
    return { success: true, message: '반품 승인 완료', data: result };
  }
}
