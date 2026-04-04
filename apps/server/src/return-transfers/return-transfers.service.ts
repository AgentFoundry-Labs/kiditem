import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Injectable()
export class ReturnTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new BadRequestException('회사를 찾을 수 없습니다');
    return first.id;
  }

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

  async findAll(query: { companyId?: string; status?: string }) {
    const resolved = await this.resolveCompanyId(query.companyId);
    const where: Record<string, unknown> = { companyId: resolved };
    if (query.status) where.status = query.status;

    return this.prisma.returnTransfer.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateReturnTransferDto) {
    const rtNumber = await this.generateRtNumber(dto.companyId);

    return this.prisma.returnTransfer.create({
      data: {
        companyId: dto.companyId,
        rtNumber,
        orderId: dto.orderId,
        productId: dto.productId,
        productName: dto.productName,
        quantity: dto.quantity,
        notes: dto.notes,
      },
      include: { product: true },
    });
  }

  async update(id: string, dto: UpdateReturnTransferDto) {
    const existing = await this.prisma.returnTransfer.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('반품을 찾을 수 없습니다');

    return this.prisma.returnTransfer.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(dto.restockedQty !== undefined && { restockedQty: dto.restockedQty }),
        ...(dto.disposedQty !== undefined && { disposedQty: dto.disposedQty }),
        ...(dto.processedBy !== undefined && { processedBy: dto.processedBy }),
      },
      include: { product: true },
    });
  }
}
