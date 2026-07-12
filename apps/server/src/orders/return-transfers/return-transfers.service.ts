import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Injectable()
export class ReturnTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private generateRtNumber(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `RT-${yy}${mm}${dd}-${Date.now()}`;
  }

  async findAll(organizationId: string, query: { status?: string }) {
    const where: Record<string, unknown> = { organizationId };
    if (query.status) where.status = query.status;

    return this.prisma.returnTransfer.findMany({
      where,
      include: { inventorySku: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, dto: CreateReturnTransferDto) {
    const inventorySku = await this.prisma.inventorySku.findFirst({
      where: { id: dto.inventorySkuId, organizationId },
      select: { optionName: true, sellpiaProductCode: true },
    });
    if (!inventorySku) throw new NotFoundException('InventorySku not found');
    const legacyOption = await this.prisma.productOption.findFirst({
      where: {
        organizationId,
        isDeleted: false,
        legacyCode: inventorySku.sellpiaProductCode,
      },
      select: { id: true },
    }) ?? await this.prisma.productOption.findFirst({
      where: {
        organizationId,
        isDeleted: false,
        sku: inventorySku.sellpiaProductCode,
      },
      select: { id: true },
    });
    if (!legacyOption) throw new NotFoundException('Legacy ProductOption mapping not found');

    const rtNumber = this.generateRtNumber();

    return this.prisma.returnTransfer.create({
      data: {
        organizationId,
        rtNumber,
        orderId: dto.orderId,
        inventorySkuId: dto.inventorySkuId,
        optionId: legacyOption.id,
        optionName: inventorySku.optionName,
        quantity: dto.quantity,
        condition: dto.condition ?? 'good',
        notes: dto.notes,
      },
      include: { inventorySku: true },
    });
  }

  async update(id: string, dto: UpdateReturnTransferDto, organizationId: string) {
    const existing = await this.prisma.returnTransfer.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('반품을 찾을 수 없습니다');

    return this.prisma.returnTransfer.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(dto.restockedQty !== undefined && { restockedQty: dto.restockedQty }),
        ...(dto.disposedQty !== undefined && { disposedQty: dto.disposedQty }),
        ...(dto.processedBy !== undefined && { processedBy: dto.processedBy }),
      },
      include: { inventorySku: true },
    });
  }
}
