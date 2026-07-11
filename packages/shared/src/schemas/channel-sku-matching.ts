import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelSkuMappingStatusSchema = z.enum([
  'unmatched',
  'needs_review',
  'matched',
]);
export type ChannelSkuMappingStatus = z.infer<typeof ChannelSkuMappingStatusSchema>;

export const ChannelSkuMappingComponentSchema = z.object({
  inventorySkuId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  reportedStock: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  mappingSource: z.string().nullable(),
});
export type ChannelSkuMappingComponent = z.infer<typeof ChannelSkuMappingComponentSchema>;

export const ChannelSkuMappingListItemSchema = z.object({
  channelAccount: z.object({
    id: z.string().uuid(),
    channel: z.string().min(1),
    name: z.string().min(1),
  }),
  product: z.object({
    id: z.string().uuid(),
    externalProductId: z.string().min(1),
    registeredName: z.string().nullable(),
    displayName: z.string().nullable(),
    status: z.string().nullable(),
  }),
  sku: z.object({
    id: z.string().uuid(),
    externalSkuId: z.string().min(1),
    sellerSku: z.string().nullable(),
    optionName: z.string().nullable(),
    barcode: z.string().nullable(),
    modelNumber: z.string().nullable(),
    salePrice: z.number().int().nonnegative().nullable(),
    status: z.string().nullable(),
    mappingStatus: ChannelSkuMappingStatusSchema,
    updatedAt: zIsoDate,
  }),
  components: z.array(ChannelSkuMappingComponentSchema),
});
export type ChannelSkuMappingListItem = z.infer<typeof ChannelSkuMappingListItemSchema>;

export const ChannelSkuMappingCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
});
export type ChannelSkuMappingCounts = z.infer<typeof ChannelSkuMappingCountsSchema>;

export const ChannelSkuMappingListResponseSchema = z.object({
  items: z.array(ChannelSkuMappingListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  counts: ChannelSkuMappingCountsSchema,
});
export type ChannelSkuMappingListResponse = z.infer<typeof ChannelSkuMappingListResponseSchema>;

export const ChannelSkuMatchCandidateReasonSchema = z.enum([
  'exact_sellpia_code',
  'unique_barcode',
  'ambiguous_identifier',
  'name_suggestion',
  'manual_search',
]);
export type ChannelSkuMatchCandidateReason = z.infer<
  typeof ChannelSkuMatchCandidateReasonSchema
>;

export const ChannelSkuMatchCandidateSchema = z.object({
  inventorySkuId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  reportedStock: z.number().int().nonnegative(),
  reason: ChannelSkuMatchCandidateReasonSchema,
  rank: z.number().int().nonnegative(),
});
export type ChannelSkuMatchCandidate = z.infer<typeof ChannelSkuMatchCandidateSchema>;

export const ChannelSkuMatchCandidateListResponseSchema = z.object({
  items: z.array(ChannelSkuMatchCandidateSchema),
});
export type ChannelSkuMatchCandidateListResponse = z.infer<
  typeof ChannelSkuMatchCandidateListResponseSchema
>;

export const MAX_CHANNEL_SKU_COMPONENTS = 50;

export const ReplaceChannelSkuComponentsInputSchema = z.object({
  components: z.array(z.object({
    inventorySkuId: z.string().uuid(),
    quantity: z.number().int().positive(),
  }).strict()).max(MAX_CHANNEL_SKU_COMPONENTS),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.components.forEach((component, index) => {
    const comparisonKey = component.inventorySkuId.toLowerCase();
    if (seen.has(comparisonKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components', index, 'inventorySkuId'],
        message: 'duplicate inventorySkuId',
      });
    }
    seen.add(comparisonKey);
  });
});
export type ReplaceChannelSkuComponentsInput = z.infer<
  typeof ReplaceChannelSkuComponentsInputSchema
>;

export const RefreshChannelSkuMappingStatusInputSchema = z.object({
  channelAccountId: z.string().uuid().optional(),
}).strict();
export type RefreshChannelSkuMappingStatusInput = z.infer<
  typeof RefreshChannelSkuMappingStatusInputSchema
>;

export const RefreshChannelSkuMappingStatusResponseSchema = ChannelSkuMappingCountsSchema;
export type RefreshChannelSkuMappingStatusResponse = z.infer<
  typeof RefreshChannelSkuMappingStatusResponseSchema
>;
