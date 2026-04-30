import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateStockTransferData,
  StockTransferBareRow,
  StockTransferRow,
  TransfersRepositoryPort,
} from '../../../application/port/out/transfers.repository.port';

const TRANSFER_INCLUDE = {
  option: true,
  fromWarehouse: true,
  toWarehouse: true,
} as const;

@Injectable()
export class TransfersRepositoryAdapter implements TransfersRepositoryPort {
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
    data: CreateStockTransferData,
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
