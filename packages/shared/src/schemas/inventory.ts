import { z } from 'zod';
import { zIsoDate } from './common.js';

export const InventorySchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  organizationId: z.string().uuid(),
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
  costPrice: z.number().int().nullable(),
  abcGrade: z.enum(['A', 'B', 'C']).nullable(),
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

// ===== Asset report =====
export const InventoryAssetGradeSummarySchema = z.object({
  grade: z.enum(['A', 'B', 'C']).nullable(),
  count: z.number().int(),
  totalStock: z.number().int(),
  totalValue: z.number().int(),
});
export type InventoryAssetGradeSummary = z.infer<typeof InventoryAssetGradeSummarySchema>;

export const InventoryAssetSummarySchema = z.object({
  totalValue: z.number().int(),
  totalStock: z.number().int(),
  totalProducts: z.number().int(),
  averageUnitCost: z.number().int(),
  byGrade: z.array(InventoryAssetGradeSummarySchema),
});
export type InventoryAssetSummary = z.infer<typeof InventoryAssetSummarySchema>;

export const InventoryAssetItemSchema = z.object({
  inventoryId: z.string().uuid(),
  optionId: z.string().uuid(),
  masterId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  grade: z.enum(['A', 'B', 'C']).nullable(),
  currentStock: z.number().int(),
  costPrice: z.number().int(),
  stockValue: z.number().int(),
});
export type InventoryAssetItem = z.infer<typeof InventoryAssetItemSchema>;

export const InventoryAssetReportSchema = z.object({
  summary: InventoryAssetSummarySchema,
  items: z.array(InventoryAssetItemSchema),
});
export type InventoryAssetReport = z.infer<typeof InventoryAssetReportSchema>;

// ===== Stock transaction (ledger row) =====
export const StockTransactionTypeSchema = z.enum(['RECEIVE', 'ISSUE', 'ADJUST']);
export type StockTransactionType = z.infer<typeof StockTransactionTypeSchema>;

export const StockTransactionSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  type: StockTransactionTypeSchema,
  quantity: z.number().int(),
  // Signed stock impact: RECEIVE > 0, ISSUE < 0, ADJUST = signed delta as written.
  // Aggregations (net stock change, ledger end stock) MUST use this, not `quantity`.
  stockDelta: z.number().int(),
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
  // Signed stock impact derived from type + stored quantity.
  // RECEIVE: +quantity, ISSUE: -quantity, ADJUST: signed quantity as recorded.
  // Use this for net stock change and ledger end-stock aggregations.
  stockDelta: z.number().int(),
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

// ===== Sellpia inventory import / review =====
export const SellpiaSnapshotStatusSchema = z.enum(['previewed', 'applied', 'failed']);
export type SellpiaSnapshotStatus = z.infer<typeof SellpiaSnapshotStatusSchema>;

export const SellpiaSnapshotItemStatusSchema = z.enum([
  'recommended',
  'needs_review',
  'approved_adjusted',
  'manual_adjusted',
  'ignored',
  'new_product_candidate',
  'missing_inventory',
  'rejected',
]);
export type SellpiaSnapshotItemStatus = z.infer<typeof SellpiaSnapshotItemStatusSchema>;

export const SellpiaBlockingReasonSchema = z.enum([
  'duplicate_code',
  'invalid_stock',
  'negative_target_stock',
  'parse_warning',
  'recent_kiditem_event',
  'new_product_candidate',
  'missing_inventory',
]);
export type SellpiaBlockingReason = z.infer<typeof SellpiaBlockingReasonSchema>;

export const SellpiaWarningReasonSchema = z.enum(['large_difference']);
export type SellpiaWarningReason = z.infer<typeof SellpiaWarningReasonSchema>;

export const SellpiaStockSnapshotSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  rowCount: z.number().int().nonnegative(),
  effectiveExportedAt: zIsoDate,
  status: SellpiaSnapshotStatusSchema,
});
export type SellpiaStockSnapshot = z.infer<typeof SellpiaStockSnapshotSchema>;

export const SellpiaStockSnapshotItemSchema = z.object({
  id: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  sellpiaProductCode: z.string().min(1),
  sellpiaProductName: z.string().nullable(),
  sellpiaStock: z.number().int().nonnegative(),
  safetyStock: z.number().int().nonnegative(),
  barcode: z.string().nullable(),
  productOptionId: z.string().uuid().nullable(),
  inventoryId: z.string().uuid().nullable(),
  rocketLedgerNet: z.number().int(),
  targetCurrentStock: z.number().int().nonnegative(),
  kiditemStockBefore: z.number().int().nonnegative(),
  diff: z.number().int(),
  diffRate: z.number().nonnegative(),
  status: SellpiaSnapshotItemStatusSchema,
  blockingReasons: z.array(SellpiaBlockingReasonSchema),
  warningReasons: z.array(SellpiaWarningReasonSchema),
  operatorTargetStock: z.number().int().nonnegative().nullable(),
  reviewNote: z.string().max(500).nullable(),
});
export type SellpiaStockSnapshotItem = z.infer<typeof SellpiaStockSnapshotItemSchema>;

export const SellpiaNewProductCandidateStatusSchema = z.enum([
  'pending',
  'linked_existing_option',
  'created_new_option',
  'ignored',
  'rejected',
]);
export type SellpiaNewProductCandidateStatus =
  z.infer<typeof SellpiaNewProductCandidateStatusSchema>;

export const SellpiaNewProductCandidateSchema = z.object({
  id: z.string().uuid(),
  snapshotItemId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  sellpiaProductName: z.string().nullable(),
  sellpiaStock: z.number().int().nonnegative(),
  safetyStock: z.number().int().nonnegative(),
  barcode: z.string().nullable(),
  status: SellpiaNewProductCandidateStatusSchema,
  operatorInitialStock: z.number().int().nonnegative().nullable(),
});
export type SellpiaNewProductCandidate =
  z.infer<typeof SellpiaNewProductCandidateSchema>;

export const SellpiaSnapshotImportResponseSchema = z.object({
  snapshot: SellpiaStockSnapshotSchema,
  summary: z.object({
    matchedCount: z.number().int().nonnegative(),
    recommendedCount: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    newProductCandidateCount: z.number().int().nonnegative(),
  }),
  items: z.array(SellpiaStockSnapshotItemSchema),
  newProductCandidates: z.array(SellpiaNewProductCandidateSchema),
});
export type SellpiaSnapshotImportResponse =
  z.infer<typeof SellpiaSnapshotImportResponseSchema>;

export const SellpiaApprovalInputSchema = z.object({
  targetCurrentStock: z.number().int().nonnegative(),
  reason: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.reason !== undefined && value.reason.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'reason cannot be blank',
    });
  }
});
export type SellpiaApprovalInput = z.infer<typeof SellpiaApprovalInputSchema>;

export const SellpiaReviewNoteInputSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type SellpiaReviewNoteInput = z.infer<typeof SellpiaReviewNoteInputSchema>;

export const SellpiaCandidateResolutionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_product'),
    masterName: z.string().min(1).max(200),
    optionName: z.string().max(100).nullable().optional(),
    sku: z.string().min(1).max(100),
    barcode: z.string().max(100).nullable().optional(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('create_option'),
    masterProductId: z.string().uuid(),
    optionName: z.string().max(100).nullable().optional(),
    sku: z.string().min(1).max(100),
    barcode: z.string().max(100).nullable().optional(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('link_option'),
    productOptionId: z.string().uuid(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('ignore'),
    note: z.string().max(500).optional(),
  }),
]);
export type SellpiaCandidateResolutionInput =
  z.infer<typeof SellpiaCandidateResolutionInputSchema>;

export const SellpiaReceiptUploadBatchStatusSchema = z.enum([
  'template_pending',
  'pending_upload',
  'uploaded',
  'needs_reupload',
  'canceled',
]);
export type SellpiaReceiptUploadBatchStatus =
  z.infer<typeof SellpiaReceiptUploadBatchStatusSchema>;

export const SellpiaReceiptUploadBatchSchema = z.object({
  id: z.string().uuid(),
  status: SellpiaReceiptUploadBatchStatusSchema,
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  templateVersion: z.string().max(50).nullable(),
  uploadedAt: zIsoDate.nullable(),
  note: z.string().max(500).nullable(),
  createdAt: zIsoDate,
});
export type SellpiaReceiptUploadBatch =
  z.infer<typeof SellpiaReceiptUploadBatchSchema>;

export const SellpiaReceiptBatchCreateInputSchema = z.object({
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});
export type SellpiaReceiptBatchCreateInput =
  z.infer<typeof SellpiaReceiptBatchCreateInputSchema>;

export const SellpiaReceiptBatchMarkUploadedInputSchema = z.object({
  note: z.string().max(500).optional(),
});
export type SellpiaReceiptBatchMarkUploadedInput =
  z.infer<typeof SellpiaReceiptBatchMarkUploadedInputSchema>;

// ===== Coupang Rocket inventory ledger =====
export const RocketInventoryEventTypeSchema = z.enum([
  'reserve',
  'release',
  'issue',
  'return_restock',
]);
export type RocketInventoryEventType = z.infer<typeof RocketInventoryEventTypeSchema>;

export const RocketInventoryEventInputSchema = z.object({
  inventoryId: z.string().uuid(),
  optionId: z.string().uuid(),
  eventType: RocketInventoryEventTypeSchema,
  quantity: z.number().int().positive(),
  sourceActionId: z.string().min(1).max(200),
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  openReservationQty: z.number().int().nonnegative().optional(),
  allowOverReservation: z.boolean().optional(),
  overrideReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (
    value.eventType === 'issue' &&
    value.allowOverReservation === true &&
    value.openReservationQty !== undefined &&
    value.quantity > value.openReservationQty &&
    !value.overrideReason?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overrideReason'],
      message: 'overrideReason is required when issuing over the open reservation',
    });
  }
});
export type RocketInventoryEventInput =
  z.infer<typeof RocketInventoryEventInputSchema>;

export const RocketInventoryEventResultSchema = z.object({
  ledgerId: z.string().uuid(),
  alreadyApplied: z.boolean(),
});
export type RocketInventoryEventResult =
  z.infer<typeof RocketInventoryEventResultSchema>;
