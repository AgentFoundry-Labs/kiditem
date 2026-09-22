import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelSkuAvailabilityStatusSchema = z.enum([
  'all',
  'in_stock',
  'out_of_stock',
  'unmatched',
  'needs_review',
]);
export type ChannelSkuAvailabilityStatus = z.infer<
  typeof ChannelSkuAvailabilityStatusSchema
>;

export const ChannelSkuAvailabilityRecipeStatusSchema = z.enum([
  'unmatched',
  'configuration_required',
  'review_required',
  'matched',
]);
export type ChannelSkuAvailabilityRecipeStatus = z.infer<
  typeof ChannelSkuAvailabilityRecipeStatusSchema
>;

export const ChannelSkuAvailabilityQuerySchema = z.object({
  channelAccountId: z.string().uuid().optional(),
  status: ChannelSkuAvailabilityStatusSchema.default('all'),
  hasBottleneck: z.boolean().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
}).strict();
export type ChannelSkuAvailabilityQuery = z.infer<
  typeof ChannelSkuAvailabilityQuerySchema
>;

export const ChannelSkuAvailabilityMappingStatusSchema = z.enum([
  'unmatched',
  'needs_review',
  'matched',
]);

export const ChannelSkuAvailabilityWarningSchema = z.enum([
  'composition_unconfirmed',
  'configuration_required',
  'inventory_unavailable',
]);

export const ChannelSkuAvailabilityComponentSchema = z.object({
  masterProductId: z.string().uuid(),
  code: z.string().min(1).nullable(),
  name: z.string().min(1).nullable(),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative().nullable(),
  purchasePrice: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive().max(2_147_483_647),
  componentCapacity: z.number().int().nonnegative().nullable(),
  isBottleneck: z.boolean().nullable(),
}).strict();
export type ChannelSkuAvailabilityComponent = z.infer<
  typeof ChannelSkuAvailabilityComponentSchema
>;

export const ChannelSkuAvailabilityItemSchema = z.object({
    channelAccount: z.object({
      id: z.string().uuid(),
      channel: z.string().min(1),
      name: z.string().min(1),
    }).strict(),
    product: z.object({
      id: z.string().uuid(),
      externalProductId: z.string().min(1),
      registeredName: z.string().nullable(),
      displayName: z.string().nullable(),
      status: z.string().nullable(),
    }).strict(),
    sku: z.object({
      id: z.string().uuid(),
      externalSkuId: z.string().min(1),
      sellerSku: z.string().nullable(),
      optionName: z.string().nullable(),
      barcode: z.string().nullable(),
      modelNumber: z.string().nullable(),
      salePrice: z.number().int().nonnegative().nullable(),
      status: z.string().nullable(),
      mappingStatus: ChannelSkuAvailabilityMappingStatusSchema,
      sellableStock: z.number().int().nonnegative().nullable(),
      updatedAt: zIsoDate,
    }).strict(),
    masterProductId: z.string().uuid().nullable(),
    recipeStatus: ChannelSkuAvailabilityRecipeStatusSchema,
    components: z.array(ChannelSkuAvailabilityComponentSchema),
    warnings: z.array(ChannelSkuAvailabilityWarningSchema).max(1),
  }).strict().superRefine((item, ctx) => {
    const expectedMappingStatus = item.recipeStatus === 'matched'
      ? 'matched'
      : item.recipeStatus === 'unmatched'
        ? 'unmatched'
        : 'needs_review';
    if (item.sku.mappingStatus !== expectedMappingStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeStatus'],
        message: 'recipeStatus must agree with the derived mappingStatus',
      });
    }
    if (
      (item.recipeStatus === 'unmatched' && item.masterProductId !== null)
      || (item.recipeStatus !== 'unmatched' && item.masterProductId === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeStatus'],
        message: 'recipeStatus must agree with the MasterProduct link',
      });
    }
  });
export type ChannelSkuAvailabilityItem = z.infer<
  typeof ChannelSkuAvailabilityItemSchema
>;

/**
 * 품절 옵션 — 레시피가 확정됐고 팔 수 있는 재고가 0 이다. 레시피가 없거나 검토 중인 옵션은 재고를
 * 모르므로 품절이 아니다(목록 `out_of_stock` 과 같은 규칙).
 */
export function isChannelSkuOutOfStock(item: Pick<ChannelSkuAvailabilityItem, 'sku'>): boolean {
  return item.sku.mappingStatus === 'matched' && item.sku.sellableStock === 0;
}

export const ChannelSkuAvailabilitySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  inStock: z.number().int().nonnegative(),
  outOfStock: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
});
export type ChannelSkuAvailabilitySummary = z.infer<
  typeof ChannelSkuAvailabilitySummarySchema
>;

export const ChannelSkuAvailabilityListResponseSchema = z.object({
  items: z.array(ChannelSkuAvailabilityItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: ChannelSkuAvailabilitySummarySchema,
});
export type ChannelSkuAvailabilityListResponse = z.infer<
  typeof ChannelSkuAvailabilityListResponseSchema
>;
