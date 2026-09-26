import { z } from 'zod';
import { zIsoDate } from './common.js';
import { SellpiaInventoryGenerationSchema } from './sellpia-inventory-freshness.js';

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
  stockValue: z.number().int().nonnegative().nullable(),
  /** 이 재고를 발행한 셀피아 재고 실행(`products.sellpia_inventory`). */
  lastOperationId: z.string().uuid().nullable(),
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

/**
 * 지금 재고를 발행한 셀피아 재고 실행(ADR-0025) — 실행 id·완료 시각·완료 세대. 옛 import run 요약(파일·해시·품질
 * 보고서)은 실행 계약으로 옮기며 없앴다(KID-361).
 */
export const SellpiaInventoryLatestCollectionSchema = z.object({
  operationId: z.string().uuid(),
  completedAt: zIsoDate,
  generation: SellpiaInventoryGenerationSchema,
}).strict();
export type SellpiaInventoryLatestCollection = z.infer<typeof SellpiaInventoryLatestCollectionSchema>;

export const InventorySkuSnapshotListResponseSchema = z.object({
  items: z.array(InventorySkuSnapshotItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: InventorySkuSnapshotSummarySchema,
  latestCollection: SellpiaInventoryLatestCollectionSchema.nullable(),
});
export type InventorySkuSnapshotListResponse = z.infer<
  typeof InventorySkuSnapshotListResponseSchema
>;
