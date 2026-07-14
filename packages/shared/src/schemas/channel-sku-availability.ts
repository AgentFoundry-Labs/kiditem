import { z } from 'zod';
import { ChannelSkuMappingListItemSchema } from './channel-sku-matching.js';

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

export const ChannelSkuAvailabilityItemSchema = ChannelSkuMappingListItemSchema;
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
