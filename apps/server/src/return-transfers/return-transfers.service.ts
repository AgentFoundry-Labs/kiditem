import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Injectable()
export class ReturnTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateRtNumber(companyId: string): Promise<string> {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `RT-${yy}${mm}${dd}`;

    const todayCount = await this.prisma.returnTransfer.count({
      where: {
        companyId,
        rtNumber: { startsWith: prefix },
      },
    });

    return `${prefix}-${todayCount + 1}`;
  }

  async findAll(companyId: string, query: { status?: string }) {
    const where: Record<string, unknown> = { companyId };
    if (query.status) where.status = query.status;

    return this.prisma.returnTransfer.findMany({
      where,
      include: { option: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateReturnTransferDto) {
    const option = await this.prisma.productOption.findFirst({
      where: { id: dto.optionId, companyId, isDeleted: false },
      select: { optionName: true },
    });
    if (!option) throw new NotFoundException('Option not found');

    const rtNumber = await this.generateRtNumber(companyId);

    return this.prisma.returnTransfer.create({
      data: {
        companyId,
        rtNumber,
        orderId: dto.orderId,
        optionId: dto.optionId,
        optionName: option.optionName,
        quantity: dto.quantity,
        condition: dto.condition ?? 'good',
        notes: dto.notes,
      },
      include: { option: true },
    });
  }

  async update(id: string, dto: UpdateReturnTransferDto, companyId: string) {
    const existing = await this.prisma.returnTransfer.findFirst({
      where: { id, companyId },
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
      include: { option: true },
    });
  }
}
