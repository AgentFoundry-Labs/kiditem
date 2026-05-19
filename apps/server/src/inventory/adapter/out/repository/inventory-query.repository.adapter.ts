import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventoryListFilters,
  InventoryQueryRepositoryPort,
  InventoryRow,
  InventoryWithOption,
  ListTransactionsFilters,
  StockTransactionRow,
  UnshippedItemRow,
} from '../../../application/port/out/repository/inventory-query.repository.port';

@Injectable()
export class InventoryQueryRepositoryAdapter implements InventoryQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listInventoryWithOption(
    organizationId: string,
    filters: InventoryListFilters,
  ): Promise<{ rows: InventoryWithOption[]; dbCount: number }> {
    const where: Prisma.InventoryWhereInput = { organizationId };
    if (filters.optionId) where.optionId = filters.optionId;
    if (filters.masterId) where.option = { masterId: filters.masterId };

    const [rows, dbCount] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          option: {
            include: { master: { select: { name: true, abcGrade: true } } },
          },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return { rows, dbCount };
  }

  findInventoryById(id: string, organizationId: string): Promise<InventoryRow | null> {
    return this.prisma.inventory.findFirst({ where: { id, organizationId } });
  }

  findInventoryByOptionId(optionId: string, organizationId: string): Promise<InventoryRow | null> {
    return this.prisma.inventory.findFirst({ where: { optionId, organizationId } });
  }

  async listStockTransactions(
    organizationId: string,
    filters: ListTransactionsFilters,
    skip: number,
    take: number,
  ): Promise<{ rows: StockTransactionRow[]; total: number }> {
    const where: Prisma.StockTransactionWhereInput = { organizationId };
    if (filters.optionId) where.optionId = filters.optionId;
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (filters.from) dateFilter.gte = new Date(filters.from);
      if (filters.to) dateFilter.lte = new Date(filters.to);
      where.createdAt = dateFilter;
    }

    const [rows, total] = await Promise.all([
      this.prisma.stockTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);

    return { rows, total };
  }

  async groupTransactionsByType(
    organizationId: string,
    fromDate: Date,
  ): Promise<
    Array<{ type: string; _sum: { quantity: number | null; totalCost: number | null } }>
  > {
    const rows = await this.prisma.stockTransaction.groupBy({
      by: ['type'],
      where: { organizationId, createdAt: { gte: fromDate } },
      _sum: { quantity: true, totalCost: true },
    });
    return rows.map((r) => ({
      type: r.type,
      _sum: { quantity: r._sum.quantity, totalCost: r._sum.totalCost },
    }));
  }

  async listUnshipped(
    organizationId: string,
    minDays: number,
    skip: number,
    take: number,
  ): Promise<{ items: UnshippedItemRow[]; total: number; delayedCount: number }> {
    const where: Prisma.UnshippedItemWhereInput = {
      organizationId,
      ...(minDays > 0 ? { delayDays: { gte: minDays } } : {}),
    };

    const [items, total, delayedCount] = await Promise.all([
      this.prisma.unshippedItem.findMany({
        where,
        orderBy: { delayDays: 'desc' },
        skip,
        take,
      }),
      this.prisma.unshippedItem.count({ where }),
      this.prisma.unshippedItem.count({
        where: { organizationId, delayDays: { gte: 3 } },
      }),
    ]);

    return { items, total, delayedCount };
  }
}
