import { BadRequestException, Injectable } from '@nestjs/common';
import { StockAuditsPersistence } from '../../adapter/out/prisma/stock-audits.persistence';
import type { StockAuditRow } from '../../adapter/out/prisma/stock-audits.persistence';

export type CreateStockAuditInput = {
  auditNumber: string;
  items?: unknown;
  totalProducts: number;
  notes?: string;
};

export type UpdateStockAuditInput = {
  status?: string;
  matchedCount?: number;
  diffCount?: number;
  items?: unknown;
  completedAt?: string;
  notes?: string;
};

@Injectable()
export class StockAuditsApplicationService {
  constructor(private readonly persistence: StockAuditsPersistence) {}

  findAll(companyId: string): Promise<StockAuditRow[]> {
    return this.persistence.listStockAudits(companyId);
  }

  create(companyId: string, dto: CreateStockAuditInput): Promise<StockAuditRow> {
    return this.persistence.createStockAudit(companyId, {
      auditNumber: dto.auditNumber,
      items: dto.items as never,
      totalProducts: dto.totalProducts,
      notes: dto.notes,
    });
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateStockAuditInput,
  ): Promise<StockAuditRow> {
    const existing = await this.persistence.findStockAuditById(id, companyId);
    if (!existing) throw new BadRequestException('재고 실사를 찾을 수 없습니다');

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.matchedCount !== undefined) data.matchedCount = dto.matchedCount;
    if (dto.diffCount !== undefined) data.diffCount = dto.diffCount;
    if (dto.items !== undefined) data.items = dto.items;
    if (dto.completedAt !== undefined) data.completedAt = new Date(dto.completedAt);
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.persistence.updateStockAudit(id, data);
  }
}
