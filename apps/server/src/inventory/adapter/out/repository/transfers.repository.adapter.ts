import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateStockTransferData,
  StockTransferBareRow,
  StockTransferRow,
  TransfersRepositoryPort,
} from '../../../application/port/out/repository/transfers.repository.port';

const TRANSFER_INCLUDE = {
  masterProduct: true,
  fromWarehouse: true,
  toWarehouse: true,
} as const;

@Injectable()
export class TransfersRepositoryAdapter implements TransfersRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listStockTransfers(organizationId: string, status?: string): Promise<StockTransferRow[]> {
    const where: Prisma.StockTransferWhereInput = { organizationId };
    if (status) where.status = status;
    return this.prisma.stockTransfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMasterProductForTransfer(
    masterProductId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null } | null> {
    return this.prisma.masterProduct.findFirst({
      where: {
        id: masterProductId,
        organizationId,
        sellpiaProductCode: { not: null },
        isDeleted: false,
      },
      select: { optionName: true },
    });
  }

  async findWarehouseIdsForTransfer(
    warehouseIds: string[],
    organizationId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.warehouse.findMany({
      where: {
        id: { in: warehouseIds },
        organizationId,
      },
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }

  createStockTransfer(
    organizationId: string,
    data: CreateStockTransferData,
  ): Promise<StockTransferRow> {
    return this.prisma.stockTransfer.create({
      data: { organizationId, ...data },
      include: TRANSFER_INCLUDE,
    });
  }

  findStockTransferById(
    id: string,
    organizationId: string,
  ): Promise<StockTransferBareRow | null> {
    return this.prisma.stockTransfer.findFirst({ where: { id, organizationId } });
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
