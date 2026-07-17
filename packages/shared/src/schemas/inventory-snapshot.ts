import { z } from 'zod';
import { zIsoDate } from './common.js';
import { SourceImportStatusSchema } from './source-import.js';
import {
  SellpiaInventoryGenerationSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryRefreshReasonSchema,
} from './sellpia-inventory-freshness.js';

export const InventorySkuStockStatusSchema = z.enum([
  'all',
  'in_stock',
  'out_of_stock',
]);
export type InventorySkuStockStatus = z.infer<typeof InventorySkuStockStatusSchema>;

export const SellpiaInventorySkuActiveStatusSchema = z.enum([
  'all',
  'active',
  'inactive',
]);
export type SellpiaInventorySkuActiveStatus = z.infer<
  typeof SellpiaInventorySkuActiveStatusSchema
>;

export const SellpiaInventorySkuLinkStatusSchema = z.enum([
  'linked',
  'unlinked',
]);
export type SellpiaInventorySkuLinkStatus = z.infer<
  typeof SellpiaInventorySkuLinkStatusSchema
>;

export const InventorySkuLinkedProductSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
}).strict();
export type InventorySkuLinkedProduct = z.infer<
  typeof InventorySkuLinkedProductSchema
>;

export const InventorySkuLinkedVariantSchema = z.object({
  id: z.string().uuid(),
  masterProductId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionLabel: z.string().nullable(),
}).strict();
export type InventorySkuLinkedVariant = z.infer<
  typeof InventorySkuLinkedVariantSchema
>;

export const InventorySkuSnapshotItemSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  purchasePrice: z.number().int().nonnegative().nullable(),
  salePrice: z.number().int().nonnegative().nullable(),
  isActive: z.boolean(),
  stockValue: z.number().int().nonnegative().nullable(),
  lastImportRunId: z.string().uuid().nullable(),
  lastImportedAt: zIsoDate.nullable(),
  linkedVariantCount: z.number().int().nonnegative(),
  linkedProductCount: z.number().int().nonnegative(),
  linkedProducts: z.array(InventorySkuLinkedProductSchema),
  linkedVariants: z.array(InventorySkuLinkedVariantSchema),
  linkStatus: SellpiaInventorySkuLinkStatusSchema,
}).strict().superRefine((value, ctx) => {
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
  const shouldBeLinked = value.linkedVariantCount > 0;
  if (shouldBeLinked !== (value.linkStatus === 'linked')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkStatus'],
      message: 'Link status must agree with the linked variant count',
    });
  }
  if (
    (value.linkStatus === 'unlinked' && value.linkedProductCount !== 0)
    || (value.linkStatus === 'linked' && value.linkedProductCount === 0)
    || value.linkedProductCount > value.linkedVariantCount
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedProductCount'],
      message: 'Linked product count must agree with linked variants',
    });
  }
  const linkedProductIds = new Set(value.linkedProducts.map(({ id }) => id));
  const linkedVariantIds = new Set(value.linkedVariants.map(({ id }) => id));
  if (
    linkedProductIds.size !== value.linkedProducts.length
    || value.linkedProductCount !== value.linkedProducts.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedProducts'],
      message: 'Linked product destinations must be distinct and agree with linkedProductCount',
    });
  }
  if (
    linkedVariantIds.size !== value.linkedVariants.length
    || value.linkedVariantCount !== value.linkedVariants.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedVariants'],
      message: 'Linked variant destinations must be distinct and agree with linkedVariantCount',
    });
  }
  value.linkedVariants.forEach((variant, index) => {
    if (!linkedProductIds.has(variant.masterProductId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedVariants', index, 'masterProductId'],
        message: 'Linked variant must belong to a published linked product destination',
      });
    }
  });
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
  fileName: z.string().min(1).nullable(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  status: SourceImportStatusSchema,
  rowCount: z.number().int().nonnegative(),
  importedAt: zIsoDate.nullable(),
  lastVerifiedAt: zIsoDate.nullable(),
  verificationCount: z.number().int().nonnegative(),
  lastTrigger: SellpiaInventoryRefreshReasonSchema.nullable(),
  freshnessGeneration: SellpiaInventoryGenerationSchema.nullable(),
  manualFreshExportConfirmedAt: zIsoDate.nullable(),
  manualFreshExportConfirmedBy: z.string().uuid().nullable(),
  qualityReport: SellpiaInventoryQualityReportSchema.nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  errorMessage: z.string().trim().min(1).max(300).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict().superRefine((run, ctx) => {
  const missingFileName = run.fileName === null;
  const missingFileHash = run.fileHash === null;
  if (missingFileName !== missingFileHash) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: missingFileName ? ['fileName'] : ['fileHash'],
      message: 'File name and hash must be present or null together',
    });
  }
  if (!missingFileName || !missingFileHash) return;
  if (
    run.status !== 'failed'
    || run.rowCount !== 0
    || run.importedAt !== null
    || run.lastVerifiedAt !== null
    || run.verificationCount !== 0
    || run.manualFreshExportConfirmedAt !== null
    || run.manualFreshExportConfirmedBy !== null
    || run.qualityReport !== null
    || run.errorCode === null
    || run.errorMessage === null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fileName'],
      message: 'Null file provenance is reserved for pre-download failures',
    });
  }
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
