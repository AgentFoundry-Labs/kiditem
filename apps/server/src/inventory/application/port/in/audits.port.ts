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
  findAll(organizationId: string): Promise<StockAuditRow[]>;
  create(organizationId: string, dto: CreateStockAuditInput): Promise<StockAuditRow>;
  update(id: string, organizationId: string, dto: UpdateStockAuditInput): Promise<StockAuditRow>;
}
