import { z } from 'zod';
import { zIsoDate } from './common.js';
import {
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SourceImportStatusSchema,
} from './source-import.js';
import {
  SellpiaInventoryGenerationSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
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

export const InventorySkuLinkedChannelOptionSchema = z.object({
  id: z.string().uuid(),
  masterProductId: z.string().uuid(),
  channelListingId: z.string().uuid(),
  channel: z.string().min(1),
  externalOptionId: z.string().min(1),
  itemName: z.string().nullable(),
}).strict();
export type InventorySkuLinkedChannelOption = z.infer<
  typeof InventorySkuLinkedChannelOptionSchema
>;

export const InventorySkuSnapshotItemSchema = z.object({
  masterProductId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  purchasePrice: z.number().int().nonnegative().nullable(),
  // 판매가 · 활성 여부는 이 원천이 내보내지 않는다. Products 가 셀피아 스냅샷에서 권위로
  // 인정하는 것은 이름 · 옵션 · 바코드 · 재고 · 매입가뿐이다(products/CLAUDE.md). KID-275(#553)가
  // 서버에서 두 칸을 떼면서 이 계약에 남겨 두어, `.strict()` 가 응답을 통째로 거절했다 —
  // 그래서 쇼핑몰 현황의 셀피아 네 칸이 조용히 빈 줄이 됐다(라이브 2026-09-22).
  stockValue: z.number().int().nonnegative().nullable(),
  lastImportRunId: z.string().uuid().nullable(),
  lastImportedAt: zIsoDate.nullable(),
  linkedChannelOptionCount: z.number().int().nonnegative(),
  linkedProductCount: z.number().int().nonnegative(),
  linkedProducts: z.array(InventorySkuLinkedProductSchema),
  linkedChannelOptions: z.array(InventorySkuLinkedChannelOptionSchema),
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
  const shouldBeLinked = value.linkedChannelOptionCount > 0;
  if (
    (!shouldBeLinked && value.linkedProductCount !== 0)
    || (shouldBeLinked && value.linkedProductCount === 0)
    || value.linkedProductCount > value.linkedChannelOptionCount
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedProductCount'],
      message: 'Linked product count must agree with linked channel options',
    });
  }
  const linkedProductIds = new Set(value.linkedProducts.map(({ id }) => id));
  const linkedChannelOptionIds = new Set(value.linkedChannelOptions.map(({ id }) => id));
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
    linkedChannelOptionIds.size !== value.linkedChannelOptions.length
    || value.linkedChannelOptionCount !== value.linkedChannelOptions.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedChannelOptions'],
      message: 'Linked channel options must be distinct and agree with linkedChannelOptionCount',
    });
  }
  value.linkedChannelOptions.forEach((option, index) => {
    if (!linkedProductIds.has(option.masterProductId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedChannelOptions', index, 'masterProductId'],
        message: 'Linked channel option must belong to a linked product destination',
      });
    }
  });
});
export type InventorySkuSnapshotItem = z.infer<typeof InventorySkuSnapshotItemSchema>;

export function deriveInventoryLinkStatus(
  facts: Pick<InventorySkuSnapshotItem, 'linkedChannelOptionCount'>,
): SellpiaInventorySkuLinkStatus {
  return facts.linkedChannelOptionCount > 0 ? 'linked' : 'unlinked';
}

export const INVENTORY_LINK_LABELS = {
  linked: '연결됨',
  unlinked: '미연결',
} as const satisfies Record<SellpiaInventorySkuLinkStatus, string>;

export const InventorySkuSnapshotSummarySchema = z.object({
  totalSkus: z.number().int().nonnegative(),
  linkedSkus: z.number().int().nonnegative(),
  unlinkedSkus: z.number().int().nonnegative(),
  inStockSkus: z.number().int().nonnegative(),
  outOfStockSkus: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  pricedAssetValue: z.number().int().nonnegative(),
  unpricedSkuCount: z.number().int().nonnegative(),
}).superRefine((summary, ctx) => {
  if (summary.linkedSkus + summary.unlinkedSkus !== summary.totalSkus) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedSkus'],
      message: 'Linked and unlinked SKU counts must equal the total SKU count',
    });
  }
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
  lastTrigger: SellpiaInventoryStoredCollectionTriggerSchema.nullable(),
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
  // This read summary exposes legacy file provenance independently. A Sellpia
  // JSON snapshot may retain fileName while fileHash stays null; the
  // canonical source-import contract validates artifact pairing separately.
  if (!missingFileName || !missingFileHash) return;
  if (
    run.status !== SOURCE_IMPORT_RUN_FAILED_STATUS
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
