import { z } from 'zod';
import { zIsoDate } from './common.js';

export const InventorySchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  companyId: z.string().uuid(),
  currentStock: z.number().int(),
  reservedStock: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  reorderQuantity: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  dailySalesAvg: z.number(),
  warehouseLocation: z.string().nullable(),
  lastRestockedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Inventory = z.infer<typeof InventorySchema>;

// ===== Status =====
export const InventoryStatusSchema = z.enum(['healthy', 'low', 'out']);
export type InventoryStatus = z.infer<typeof InventoryStatusSchema>;

// ===== List item (option + master flattened) =====
export const InventoryListItemSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  masterId: z.string().uuid(),
  sku: z.string(),
  masterName: z.string(),
  optionName: z.string().nullable(),
  kind: z.enum(['SIMPLE', 'BUNDLE']),
  currentStock: z.number().int(),
  availableStock: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  warehouseLocation: z.string().nullable(),
  status: InventoryStatusSchema,
});
export type InventoryListItem = z.infer<typeof InventoryListItemSchema>;

// ===== Summary =====
export const InventorySummarySchema = z.object({
  total: z.number().int(),
  healthy: z.number().int(),
  low: z.number().int(),
  out: z.number().int(),
});
export type InventorySummary = z.infer<typeof InventorySummarySchema>;

// ===== List response =====
export const InventoryListResponseSchema = z.object({
  items: z.array(InventoryListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  summary: InventorySummarySchema,
});
export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;

// ===== Stock transaction (ledger row) =====
export const StockTransactionTypeSchema = z.enum(['RECEIVE', 'ISSUE', 'ADJUST']);
export type StockTransactionType = z.infer<typeof StockTransactionTypeSchema>;

export const StockTransactionSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  type: StockTransactionTypeSchema,
  quantity: z.number().int(),
  unitCost: z.number().int(),
  createdAt: zIsoDate,
});
export type StockTransaction = z.infer<typeof StockTransactionSchema>;

// ===== Mutation result =====
export const StockOperationResultSchema = z.object({
  inventory: InventorySchema,
  transaction: StockTransactionSchema,
  recomputedBundleOptionIds: z.array(z.string().uuid()),
});
export type StockOperationResult = z.infer<typeof StockOperationResultSchema>;

// ===== Ledger list / summary =====
export const TransactionListItemSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  optionName: z.string().nullable(),
  type: StockTransactionTypeSchema,
  quantity: z.number().int(),
  unitCost: z.number().int(),
  totalCost: z.number().int(),
  warehouseId: z.string().uuid().nullable(),
  relatedId: z.string().nullable(),
  relatedType: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: zIsoDate,
});
export type TransactionListItem = z.infer<typeof TransactionListItemSchema>;

export const TransactionListResponseSchema = z.object({
  items: z.array(TransactionListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type TransactionListResponse = z.infer<typeof TransactionListResponseSchema>;

export const TransactionSummarySchema = z.object({
  inQty: z.number().int(),
  outQty: z.number().int(),
  adjustQty: z.number().int(),
  inAmount: z.number().int(),
  outAmount: z.number().int(),
});
export type TransactionSummary = z.infer<typeof TransactionSummarySchema>;

// ===== Input schemas =====
export const ReceiveStockInputSchema = z.object({
  quantity: z.number().int().positive(),
  unitCost: z.number().int().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});
export type ReceiveStockInput = z.infer<typeof ReceiveStockInputSchema>;

export const IssueStockInputSchema = z.object({
  quantity: z.number().int().positive(),
  warehouseId: z.string().uuid().optional(),
  relatedId: z.string().max(100).optional(),
  relatedType: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});
export type IssueStockInput = z.infer<typeof IssueStockInputSchema>;

export const AdjustStockInputSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'delta must be non-zero'),
  reason: z.string().min(1).max(500),
});
export type AdjustStockInput = z.infer<typeof AdjustStockInputSchema>;

export const UpdateInventoryMetadataInputSchema = z.object({
  safetyStock: z.number().int().nonnegative().optional(),
  reorderPoint: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  warehouseLocation: z.string().max(100).nullable().optional(),
});
export type UpdateInventoryMetadataInput = z.infer<typeof UpdateInventoryMetadataInputSchema>;
