import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AUDITS_PORT,
  type AuditsPort,
  type CreateStockAuditInput,
  type UpdateStockAuditInput,
} from '../port/in/audits.port';
import {
  AUDITS_REPOSITORY_PORT,
  type AuditsRepositoryPort,
  type StockAuditUpdateData,
  type StockAuditRow,
} from '../port/out/repository/audits.repository.port';

export { AUDITS_PORT } from '../port/in/audits.port';

@Injectable()
export class AuditsService implements AuditsPort {
  constructor(
    @Inject(AUDITS_REPOSITORY_PORT)
    private readonly repository: AuditsRepositoryPort,
  ) {}

  findAll(organizationId: string): Promise<StockAuditRow[]> {
    return this.repository.listStockAudits(organizationId);
  }

  create(organizationId: string, dto: CreateStockAuditInput): Promise<StockAuditRow> {
    return this.repository.createStockAudit(organizationId, {
      auditNumber: dto.auditNumber,
      items: dto.items,
      totalProducts: dto.totalProducts,
      notes: dto.notes,
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateStockAuditInput,
  ): Promise<StockAuditRow> {
    const existing = await this.repository.findStockAuditById(id, organizationId);
    if (!existing) throw new BadRequestException('재고 실사를 찾을 수 없습니다');

    const data: StockAuditUpdateData = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.matchedCount !== undefined) data.matchedCount = dto.matchedCount;
    if (dto.diffCount !== undefined) data.diffCount = dto.diffCount;
    if (dto.items !== undefined) data.items = dto.items;
    if (dto.completedAt !== undefined) data.completedAt = new Date(dto.completedAt);
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.repository.updateStockAudit(id, data);
  }
}
