import { z } from 'zod';
import { zIsoDate } from './common.js';
import { SourceImportStatusSchema } from './source-import.js';

export const InventorySkuStockStatusSchema = z.enum([
  'all',
  'in_stock',
  'out_of_stock',
]);
export type InventorySkuStockStatus = z.infer<typeof InventorySkuStockStatusSchema>;

export const InventorySkuSnapshotItemSchema = z.object({
  id: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  purchasePrice: z.number().int().nonnegative().nullable(),
  salePrice: z.number().int().nonnegative().nullable(),
  stockValue: z.number().int().nonnegative().nullable(),
  lastImportRunId: z.string().uuid().nullable(),
  lastImportedAt: zIsoDate.nullable(),
}).superRefine((value, ctx) => {
  if (value.purchasePrice === null && value.stockValue !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stockValue'],
      message: 'Stock value must be null when purchase price is null',
    });
  }
  if (value.purchasePrice !== null && value.stockValue === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stockValue'],
      message: 'Stock value is required when purchase price is present',
    });
  }
});
export type InventorySkuSnapshotItem = z.infer<typeof InventorySkuSnapshotItemSchema>;

export const InventorySkuSnapshotSummarySchema = z.object({
  totalSkus: z.number().int().nonnegative(),
  inStockSkus: z.number().int().nonnegative(),
  outOfStockSkus: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  pricedAssetValue: z.number().int().nonnegative(),
  unpricedSkuCount: z.number().int().nonnegative(),
});
export type InventorySkuSnapshotSummary = z.infer<
  typeof InventorySkuSnapshotSummarySchema
>;

export const SellpiaImportRunSummarySchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().min(1),
  status: SourceImportStatusSchema,
  rowCount: z.number().int().nonnegative(),
  importedAt: zIsoDate.nullable(),
});
export type SellpiaImportRunSummary = z.infer<typeof SellpiaImportRunSummarySchema>;

export const InventorySkuSnapshotListResponseSchema = z.object({
  items: z.array(InventorySkuSnapshotItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: InventorySkuSnapshotSummarySchema,
  latestImport: SellpiaImportRunSummarySchema.nullable(),
});
export type InventorySkuSnapshotListResponse = z.infer<
  typeof InventorySkuSnapshotListResponseSchema
>;

export const SellpiaImportRunListResponseSchema = z.object({
  items: z.array(SellpiaImportRunSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type SellpiaImportRunListResponse = z.infer<
  typeof SellpiaImportRunListResponseSchema
>;
