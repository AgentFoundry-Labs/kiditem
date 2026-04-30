import type { StockAuditRow } from '../out/audits.repository.port';

export const AUDITS_PORT = Symbol('AuditsPort');

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

export interface AuditsPort {
  findAll(companyId: string): Promise<StockAuditRow[]>;
  create(companyId: string, dto: CreateStockAuditInput): Promise<StockAuditRow>;
  update(id: string, companyId: string, dto: UpdateStockAuditInput): Promise<StockAuditRow>;
}
