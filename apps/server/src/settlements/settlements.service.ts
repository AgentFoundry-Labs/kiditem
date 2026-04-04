import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.settlement.findMany({
      where: { companyId },
      orderBy: { period: 'desc' },
    });
  }

  async create(dto: CreateSettlementDto) {
    return this.prisma.settlement.create({
      data: {
        companyId: dto.companyId,
        period: dto.period,
        expectedAmount: dto.expectedAmount,
        commission: dto.commission,
        shippingFee: dto.shippingFee,
        orderCount: dto.orderCount,
        returnCount: dto.returnCount,
      },
    });
  }

  async update(id: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.settlement.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('정산 내역을 찾을 수 없습니다');
    }

    return this.prisma.settlement.update({
      where: { id },
      data: {
        ...(dto.actualAmount !== undefined && { actualAmount: dto.actualAmount }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }
}
