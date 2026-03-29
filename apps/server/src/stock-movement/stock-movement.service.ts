import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class StockMovementService {
  constructor(private readonly prisma: PrismaService) {}

  private isInType(type: string): boolean {
    return type === 'in' || type === 'purchase' || type === 'return_in';
  }

  async findAll(query: {
    page: number;
    limit: number;
    type?: string;
    from?: string;
    groupBy?: string;
  }) {
    const { page, limit, type, from, groupBy } = query;

    const where: Prisma.StockTransactionWhereInput = {};
    if (type) where.type = type;
    if (from) where.createdAt = { gte: new Date(from) };

    const transactions = await this.prisma.stockTransaction.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    let inQty = 0;
    let outQty = 0;
    let inAmount = 0;
    let outAmount = 0;

    for (const tx of transactions) {
      if (this.isInType(tx.type)) {
        inQty += tx.quantity;
        inAmount += tx.totalCost;
      } else {
        outQty += tx.quantity;
        outAmount += tx.totalCost;
      }
    }

    const groupedMap = new Map<
      string,
      { inQty: number; outQty: number; inAmt: number; outAmt: number }
    >();

    for (const tx of transactions) {
      const key =
        groupBy === 'date'
          ? tx.createdAt.toISOString().slice(0, 10)
          : groupBy === 'type'
            ? tx.type || 'unknown'
            : tx.product?.name || tx.productName || tx.productId;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, { inQty: 0, outQty: 0, inAmt: 0, outAmt: 0 });
      }
      const g = groupedMap.get(key)!;
      if (this.isInType(tx.type)) {
        g.inQty += tx.quantity;
        g.inAmt += tx.totalCost;
      } else {
        g.outQty += tx.quantity;
        g.outAmt += tx.totalCost;
      }
    }

    const grouped = Array.from(groupedMap.entries()).map(([key, val]) => ({
      key,
      ...val,
    }));

    const total = transactions.length;
    const items = transactions.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      items,
      total,
      page,
      limit,
      summary: { inQty, outQty, inAmount, outAmount },
      grouped,
    };
  }

  async getSummary(days: number) {
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const result = await this.findAll({
      page: 1,
      limit: 1,
      from,
    });
    return result.summary;
  }
}
