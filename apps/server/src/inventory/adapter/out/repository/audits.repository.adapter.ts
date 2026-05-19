import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AuditsRepositoryPort,
  CreateStockAuditData,
  StockAuditRow,
  StockAuditUpdateData,
} from '../../../application/port/out/repository/audits.repository.port';

@Injectable()
export class AuditsRepositoryAdapter implements AuditsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listStockAudits(organizationId: string): Promise<StockAuditRow[]> {
    return this.prisma.stockAudit.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findStockAuditById(id: string, organizationId: string): Promise<StockAuditRow | null> {
    return this.prisma.stockAudit.findFirst({ where: { id, organizationId } });
  }

  createStockAudit(organizationId: string, data: CreateStockAuditData): Promise<StockAuditRow> {
    return this.prisma.stockAudit.create({
      data: {
        organizationId,
        auditNumber: data.auditNumber,
        items: data.items === undefined ? undefined : (data.items as Prisma.InputJsonValue),
        totalProducts: data.totalProducts,
        notes: data.notes,
      },
    });
  }

  updateStockAudit(id: string, data: StockAuditUpdateData): Promise<StockAuditRow> {
    const prismaData: Prisma.StockAuditUpdateInput = {};
    if (data.status !== undefined) prismaData.status = data.status;
    if (data.matchedCount !== undefined) prismaData.matchedCount = data.matchedCount;
    if (data.diffCount !== undefined) prismaData.diffCount = data.diffCount;
    if (data.items !== undefined) prismaData.items = data.items as Prisma.InputJsonValue;
    if (data.completedAt !== undefined) prismaData.completedAt = data.completedAt;
    if (data.notes !== undefined) prismaData.notes = data.notes;
    return this.prisma.stockAudit.update({ where: { id }, data: prismaData });
  }
}
