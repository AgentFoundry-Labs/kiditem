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

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new BadRequestException('회사를 찾을 수 없습니다');
    return first.id;
  }

  async findAll(query: { companyId?: string; status?: string }) {
    const resolved = await this.resolveCompanyId(query.companyId);
    const where: Record<string, unknown> = { companyId: resolved };
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

  async create(dto: CreateStockTransferDto) {
    return this.prisma.stockTransfer.create({
      data: {
        companyId: dto.companyId,
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
