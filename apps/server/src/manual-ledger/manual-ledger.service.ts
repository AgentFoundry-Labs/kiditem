import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualLedgerDto } from './dto';

@Injectable()
export class ManualLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, type?: string, period?: string) {
    const where: Record<string, unknown> = { companyId };

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

  async create(companyId: string, dto: CreateManualLedgerDto) {
    return this.prisma.manualLedger.create({
      data: {
        companyId,
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

  async delete(id: string) {
    const existing = await this.prisma.manualLedger.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('수기 장부 항목을 찾을 수 없습니다');
    }

    await this.prisma.manualLedger.delete({ where: { id } });
    return { ok: true };
  }
}
