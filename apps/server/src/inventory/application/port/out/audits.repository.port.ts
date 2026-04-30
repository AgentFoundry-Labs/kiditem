export const AUDITS_REPOSITORY_PORT = Symbol('AuditsRepositoryPort');

export type StockAuditRow = {
  id: string;
  companyId: string;
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
  listStockAudits(companyId: string): Promise<StockAuditRow[]>;
  findStockAuditById(id: string, companyId: string): Promise<StockAuditRow | null>;
  createStockAudit(companyId: string, data: CreateStockAuditData): Promise<StockAuditRow>;
  updateStockAudit(id: string, data: StockAuditUpdateData): Promise<StockAuditRow>;
}
