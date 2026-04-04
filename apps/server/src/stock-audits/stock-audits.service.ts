import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockAuditDto } from './dto';
import { UpdateStockAuditDto } from './dto';

@Injectable()
export class StockAuditsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new BadRequestException('회사를 찾을 수 없습니다');
    return first.id;
  }

  async findAll(companyId?: string) {
    const resolved = await this.resolveCompanyId(companyId);
    return this.prisma.stockAudit.findMany({
      where: { companyId: resolved },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateStockAuditDto) {
    return this.prisma.stockAudit.create({
      data: {
        companyId: dto.companyId,
        auditNumber: dto.auditNumber,
        items: dto.items ?? undefined,
        totalProducts: dto.totalProducts,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateStockAuditDto) {
    const existing = await this.prisma.stockAudit.findUnique({ where: { id } });
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
