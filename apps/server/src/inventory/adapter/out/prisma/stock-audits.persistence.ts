import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export type StockAuditRow = Prisma.StockAuditGetPayload<{}>;

@Injectable()
export class StockAuditsPersistence {
  constructor(private readonly prisma: PrismaService) {}

  listStockAudits(companyId: string): Promise<StockAuditRow[]> {
    return this.prisma.stockAudit.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findStockAuditById(id: string, companyId: string): Promise<StockAuditRow | null> {
    return this.prisma.stockAudit.findFirst({ where: { id, companyId } });
  }

  createStockAudit(
    companyId: string,
    data: {
      auditNumber: string;
      items?: Prisma.InputJsonValue;
      totalProducts: number;
      notes?: string;
    },
  ): Promise<StockAuditRow> {
    return this.prisma.stockAudit.create({
      data: {
        companyId,
        auditNumber: data.auditNumber,
        items: data.items ?? undefined,
        totalProducts: data.totalProducts,
        notes: data.notes,
      },
    });
  }

  updateStockAudit(
    id: string,
    data: Prisma.StockAuditUpdateInput,
  ): Promise<StockAuditRow> {
    return this.prisma.stockAudit.update({ where: { id }, data });
  }
}
