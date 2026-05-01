export const AUDITS_REPOSITORY_PORT = Symbol('AuditsRepositoryPort');

export type StockAuditRow = {
  id: string;
  organizationId: string;
  auditNumber: string;
  status: string;
  totalProducts: number;
  matchedCount: number;
  diffCount: number;
  auditedBy: string | null;
  completedAt: Date | null;
  notes: string | null;
  items: unknown;
  createdAt: Date;
};

export type CreateStockAuditData = {
  auditNumber: string;
  items?: unknown;
  totalProducts: number;
  notes?: string;
};

export type StockAuditUpdateData = {
  status?: string;
  matchedCount?: number;
  diffCount?: number;
  items?: unknown;
  completedAt?: Date | null;
  notes?: string | null;
};

export interface AuditsRepositoryPort {
  listStockAudits(organizationId: string): Promise<StockAuditRow[]>;
  findStockAuditById(id: string, organizationId: string): Promise<StockAuditRow | null>;
  createStockAudit(organizationId: string, data: CreateStockAuditData): Promise<StockAuditRow>;
  updateStockAudit(id: string, data: StockAuditUpdateData): Promise<StockAuditRow>;
}
