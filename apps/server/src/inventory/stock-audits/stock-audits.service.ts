import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStockAuditDto } from './dto';
import { UpdateStockAuditDto } from './dto';

@Injectable()
export class StockAuditsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.stockAudit.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateStockAuditDto) {
    return this.prisma.stockAudit.create({
      data: {
        companyId,
        auditNumber: dto.auditNumber,
        items: dto.items ?? undefined,
        totalProducts: dto.totalProducts,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateStockAuditDto) {
    const existing = await this.prisma.stockAudit.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new BadRequestException('재고 실사를 찾을 수 없습니다');

    return this.prisma.stockAudit.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.matchedCount !== undefined && { matchedCount: dto.matchedCount }),
        ...(dto.diffCount !== undefined && { diffCount: dto.diffCount }),
        ...(dto.items !== undefined && { items: dto.items }),
        ...(dto.completedAt !== undefined && { completedAt: new Date(dto.completedAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }
}
