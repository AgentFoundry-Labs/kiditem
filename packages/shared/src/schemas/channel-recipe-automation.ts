import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelRecipeAutomationDecisionSchema = z.enum([
  'auto_apply',
  'operator_review',
  'blocked',
  'already_configured',
]);
export type ChannelRecipeAutomationDecision = z.infer<
  typeof ChannelRecipeAutomationDecisionSchema
>;

export const ChannelRecipeAutomationReasonSchema = z.enum([
  'exact_unique_code',
  'unique_physical_barcode',
  'exact_unique_name_option',
  'quantity_review',
  'conflict',
  'ambiguous',
  'name_review_only',
  'no_match',
  'already_configured',
]);
export type ChannelRecipeAutomationReason = z.infer<
  typeof ChannelRecipeAutomationReasonSchema
>;

export const ChannelRecipeAutomationItemSchema = z.object({
  productVariantId: z.string().uuid(),
  masterProductId: z.string().uuid(),
  channelListingOptionIds: z.array(z.string().uuid()).min(1),
  decision: ChannelRecipeAutomationDecisionSchema,
  reason: ChannelRecipeAutomationReasonSchema,
  sellpiaInventorySkuId: z.string().uuid().nullable(),
  sellpiaCode: z.string().min(1).nullable(),
  recommendedQuantity: z.number().int().positive().nullable(),
  evidenceLabels: z.array(z.string().min(1)),
}).strict().superRefine((item, ctx) => {
  if (
    item.decision === 'auto_apply'
    && (!item.sellpiaInventorySkuId || item.recommendedQuantity !== 1)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recommendedQuantity'],
      message: 'auto_apply requires one Sellpia SKU with quantity 1',
    });
  }
});
export type ChannelRecipeAutomationItem = z.infer<
  typeof ChannelRecipeAutomationItemSchema
>;

export const ChannelRecipeAutomationPreviewSchema = z.object({
  channelAccountId: z.string().uuid(),
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: zIsoDate,
  summary: z.object({
    variants: z.number().int().nonnegative(),
    affectedOptions: z.number().int().nonnegative(),
    autoApply: z.number().int().nonnegative(),
    operatorReview: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    alreadyConfigured: z.number().int().nonnegative(),
  }).strict(),
  items: z.array(ChannelRecipeAutomationItemSchema),
}).strict();
export type ChannelRecipeAutomationPreview = z.infer<
  typeof ChannelRecipeAutomationPreviewSchema
>;

export const ApplyChannelRecipeAutomationInputSchema = z.object({
  channelAccountId: z.string().uuid(),
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ApplyChannelRecipeAutomationInput = z.infer<
  typeof ApplyChannelRecipeAutomationInputSchema
>;

export const ApplyChannelRecipeAutomationResponseSchema = z.object({
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
  appliedVariants: z.number().int().nonnegative(),
  affectedOptions: z.number().int().nonnegative(),
  skippedExistingVariants: z.number().int().nonnegative(),
}).strict();
export type ApplyChannelRecipeAutomationResponse = z.infer<
  typeof ApplyChannelRecipeAutomationResponseSchema
>;
