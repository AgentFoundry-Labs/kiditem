import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const TRANSFER_INCLUDE = {
  option: true,
  fromWarehouse: true,
  toWarehouse: true,
} as const;

export type StockTransferRow = Prisma.StockTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;
export type StockTransferBareRow = Prisma.StockTransferGetPayload<{}>;

@Injectable()
export class StockTransfersPersistence {
  constructor(private readonly prisma: PrismaService) {}

  listStockTransfers(companyId: string, status?: string): Promise<StockTransferRow[]> {
    const where: Prisma.StockTransferWhereInput = { companyId };
    if (status) where.status = status;
    return this.prisma.stockTransfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOptionForTransfer(
    optionId: string,
    companyId: string,
  ): Promise<{ optionName: string | null } | null> {
    return this.prisma.productOption.findFirst({
      where: { id: optionId, companyId, isDeleted: false },
      select: { optionName: true },
    });
  }

  createStockTransfer(
    companyId: string,
    data: {
      optionId: string;
      optionName: string | null;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      notes?: string;
    },
  ): Promise<StockTransferRow> {
    return this.prisma.stockTransfer.create({
      data: { companyId, ...data },
      include: TRANSFER_INCLUDE,
    });
  }

  findStockTransferById(
    id: string,
    companyId: string,
  ): Promise<StockTransferBareRow | null> {
    return this.prisma.stockTransfer.findFirst({ where: { id, companyId } });
  }

  updateStockTransferStatus(
    id: string,
    status: string,
    completed: boolean,
  ): Promise<StockTransferRow> {
    const data: Prisma.StockTransferUpdateInput = { status };
    if (completed) data.completedAt = new Date();
    return this.prisma.stockTransfer.update({
      where: { id },
      data,
      include: TRANSFER_INCLUDE,
    });
  }
}
