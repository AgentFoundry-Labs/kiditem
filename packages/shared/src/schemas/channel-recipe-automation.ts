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
  'exact_unique_name',
  'high_confidence_name',
  'identifier_name_mismatch',
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
    && (!item.sellpiaInventorySkuId || item.recommendedQuantity === null)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recommendedQuantity'],
      message: 'auto_apply requires one Sellpia SKU with a positive quantity',
    });
  }
});
export type ChannelRecipeAutomationItem = z.infer<
  typeof ChannelRecipeAutomationItemSchema
>;

export const ChannelRecipeAutomationProductGroupSchema = z.object({
  channelListingId: z.string().uuid(),
  masterProductId: z.string().uuid().nullable(),
  channelListingOptionIds: z.array(z.string().uuid()).min(1),
  productVariantIds: z.array(z.string().uuid()),
  decision: ChannelRecipeAutomationDecisionSchema,
  autoApplyProductVariantIds: z.array(z.string().uuid()),
}).strict().superRefine((group, ctx) => {
  if (
    group.decision === 'auto_apply'
    && group.autoApplyProductVariantIds.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['autoApplyProductVariantIds'],
      message: 'auto_apply requires at least one automatic variant',
    });
  }

  const productVariantIds = new Set(group.productVariantIds);
  if (group.autoApplyProductVariantIds.some((id) => !productVariantIds.has(id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['autoApplyProductVariantIds'],
      message: 'automatic variants must belong to the product group',
    });
  }
});
export type ChannelRecipeAutomationProductGroup = z.infer<
  typeof ChannelRecipeAutomationProductGroupSchema
>;

export const ChannelRecipeAutomationPreviewSchema = z.object({
  channelAccountId: z.string().uuid(),
  proposalVersion: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: zIsoDate,
  summary: z.object({
    products: z.number().int().nonnegative(),
    autoApplyProducts: z.number().int().nonnegative(),
    operatorReviewProducts: z.number().int().nonnegative(),
    blockedProducts: z.number().int().nonnegative(),
    alreadyConfiguredProducts: z.number().int().nonnegative(),
    variants: z.number().int().nonnegative(),
    affectedOptions: z.number().int().nonnegative(),
    autoApply: z.number().int().nonnegative(),
    operatorReview: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    alreadyConfigured: z.number().int().nonnegative(),
  }).strict(),
  productGroups: z.array(ChannelRecipeAutomationProductGroupSchema),
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
  appliedProducts: z.number().int().nonnegative(),
  skippedProducts: z.number().int().nonnegative(),
  appliedVariants: z.number().int().nonnegative(),
  affectedOptions: z.number().int().nonnegative(),
  skippedExistingVariants: z.number().int().nonnegative(),
}).strict();
export type ApplyChannelRecipeAutomationResponse = z.infer<
  typeof ApplyChannelRecipeAutomationResponseSchema
>;
