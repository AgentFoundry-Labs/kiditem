import { z } from 'zod';
import {
  ChannelSkuMappingComponentSchema,
  ChannelSkuMappingListItemSchema,
} from './channel-sku-matching.js';
import { ProductVariantComponentSourceSchema } from './product-operations.js';

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

export const ChannelSkuAvailabilityComponentSchema =
  ChannelSkuMappingComponentSchema.omit({
    masterProductId: true,
    mappingSource: true,
  }).extend({
    sellpiaInventorySkuId: z.string().uuid(),
    source: ProductVariantComponentSourceSchema,
  });
export type ChannelSkuAvailabilityComponent = z.infer<
  typeof ChannelSkuAvailabilityComponentSchema
>;

export const ChannelSkuAvailabilityItemSchema =
  ChannelSkuMappingListItemSchema.omit({ components: true }).extend({
    productVariantId: z.string().uuid().nullable(),
    variantCode: z.string().min(1).nullable(),
    variantName: z.string().min(1).nullable(),
    recipeStatus: ChannelSkuAvailabilityRecipeStatusSchema,
    components: z.array(ChannelSkuAvailabilityComponentSchema),
  }).superRefine((item, ctx) => {
    const linkFields = [
      item.productVariantId,
      item.variantCode,
      item.variantName,
    ];
    const nullCount = linkFields.filter((value) => value === null).length;
    if (nullCount !== 0 && nullCount !== linkFields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productVariantId'],
        message: 'Variant identity fields must be present or null together',
      });
    }
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
      (item.recipeStatus === 'unmatched' && item.productVariantId !== null)
      || (item.recipeStatus !== 'unmatched' && item.productVariantId === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeStatus'],
        message: 'recipeStatus must agree with the ProductVariant link',
      });
    }
  });
export type ChannelSkuAvailabilityItem = z.infer<
  typeof ChannelSkuAvailabilityItemSchema
>;

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
