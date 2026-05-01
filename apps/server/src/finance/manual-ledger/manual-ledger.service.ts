import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateManualLedgerDto } from './dto';

@Injectable()
export class ManualLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, type?: string, period?: string) {
    const where: Prisma.ManualLedgerWhereInput = { organizationId };

    if (type) {
      where.type = type;
    }

    if (period) {
      // period = "YYYY-MM"
      const [year, month] = period.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      where.date = { gte: start, lt: end };
    }

    return this.prisma.manualLedger.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(organizationId: string, dto: CreateManualLedgerDto) {
    return this.prisma.manualLedger.create({
      data: {
        organizationId,
        date: new Date(dto.date),
        type: dto.type,
        category: dto.category,
        counterpart: dto.counterpart,
        description: dto.description,
        amount: dto.amount,
        tax: dto.tax ?? 0,
      },
    });
  }

  async delete(id: string, organizationId: string) {
    const result = await this.prisma.manualLedger.deleteMany({
      where: { id, organizationId },
    });
    if (result.count === 0) {
      throw new BadRequestException('수기 장부 항목을 찾을 수 없습니다');
    }
    return { ok: true };
  }
}
