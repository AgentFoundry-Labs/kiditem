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
  option: true,
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

  findOptionForTransfer(
    optionId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null } | null> {
    return this.prisma.productOption.findFirst({
      where: { id: optionId, organizationId, isDeleted: false },
      select: { optionName: true },
    });
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
