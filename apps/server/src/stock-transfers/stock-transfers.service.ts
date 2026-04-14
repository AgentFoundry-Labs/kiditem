import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockTransferDto, UpdateStockTransferDto } from './dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_transit', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
};

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: { status?: string }) {
    const where: Record<string, unknown> = { companyId };
    if (query.status) where.status = query.status;

    return this.prisma.stockTransfer.findMany({
      where,
      include: {
        product: true,
        fromWarehouse: true,
        toWarehouse: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateStockTransferDto) {
    return this.prisma.stockTransfer.create({
      data: {
        companyId,
        productId: dto.productId,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        quantity: dto.quantity,
        notes: dto.notes,
      },
      include: {
        product: true,
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
  }

  async update(id: string, dto: UpdateStockTransferDto) {
    const existing = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('재고 이동을 찾을 수 없습니다');

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(dto.status)) {
      throw new BadRequestException(
        `상태 전환 불가: ${existing.status} → ${dto.status}`,
      );
    }

    const updateData: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'completed') {
      updateData.completedAt = new Date();
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: updateData,
      include: {
        product: true,
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
  }
}
