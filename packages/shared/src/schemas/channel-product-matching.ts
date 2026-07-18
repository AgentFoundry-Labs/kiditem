import { z } from 'zod';
import { ChannelRecipeAutomationDecisionSchema } from './channel-recipe-automation.js';
import { zIsoDate } from './common.js';

export const ChannelMatchCandidateReasonSchema = z.enum([
  'existing_identity',
  'exact_code',
  'unique_barcode',
  'exact_normalized_name',
  'ai_suggestion',
  'manual_search',
]);
export type ChannelMatchCandidateReason = z.infer<
  typeof ChannelMatchCandidateReasonSchema
>;

export const ChannelMatchEvidenceSchema = z.object({
  providerIdentity: z.string().min(1).nullable(),
  code: z.string().min(1).nullable(),
  barcode: z.string().min(1).nullable(),
  normalizedName: z.string().min(1).nullable(),
  aiExplanation: z.string().min(1).nullable(),
  score: z.number().min(0).max(1).nullable(),
}).strict();
export type ChannelMatchEvidence = z.infer<typeof ChannelMatchEvidenceSchema>;

function requireCandidateEvidence(
  candidate: {
    reason: ChannelMatchCandidateReason;
    evidence: ChannelMatchEvidence;
  },
  ctx: z.RefinementCtx,
) {
  const evidenceFieldByReason = {
    existing_identity: 'providerIdentity',
    exact_code: 'code',
    unique_barcode: 'barcode',
    exact_normalized_name: 'normalizedName',
    ai_suggestion: 'aiExplanation',
  } as const;
  if (candidate.reason === 'manual_search') {
    const hasEvidence = [
      candidate.evidence.providerIdentity,
      candidate.evidence.code,
      candidate.evidence.barcode,
      candidate.evidence.normalizedName,
      candidate.evidence.aiExplanation,
    ].some((value) => value !== null);
    if (!hasEvidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence'],
        message: 'manual_search candidates require non-empty evidence',
      });
    }
    return;
  }
  const requiredField = evidenceFieldByReason[candidate.reason];
  if (candidate.evidence[requiredField] === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence', requiredField],
      message: `${candidate.reason} candidates require ${requiredField} evidence`,
    });
  }
}

export const ChannelProductMatchCandidateSchema = z.object({
  masterProductId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  reason: ChannelMatchCandidateReasonSchema,
  evidence: ChannelMatchEvidenceSchema,
  rank: z.number().int().positive(),
}).strict().superRefine(requireCandidateEvidence);
export type ChannelProductMatchCandidate = z.infer<
  typeof ChannelProductMatchCandidateSchema
>;

export const ChannelVariantMatchCandidateSchema = z.object({
  productVariantId: z.string().uuid(),
  masterProductId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionLabel: z.string().nullable(),
  reason: ChannelMatchCandidateReasonSchema,
  evidence: ChannelMatchEvidenceSchema,
  rank: z.number().int().positive(),
}).strict().superRefine(requireCandidateEvidence);
export type ChannelVariantMatchCandidate = z.infer<
  typeof ChannelVariantMatchCandidateSchema
>;

export const ChannelMatchingAccountSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  name: z.string().min(1),
}).strict();
export type ChannelMatchingAccount = z.infer<typeof ChannelMatchingAccountSchema>;

export const ChannelProductMatchingQueueRowSchema = z.object({
  channelAccount: ChannelMatchingAccountSchema,
  listing: z.object({
    id: z.string().uuid(),
    externalId: z.string().min(1),
    displayName: z.string().nullable(),
    status: z.string().nullable(),
    masterProductId: z.string().uuid().nullable(),
    updatedAt: zIsoDate,
  }).strict(),
  linkedProduct: z.object({
    id: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
  }).strict().nullable(),
  optionCount: z.number().int().nonnegative(),
  linkedOptionCount: z.number().int().nonnegative(),
}).strict().superRefine((row, ctx) => {
  if ((row.listing.masterProductId === null) !== (row.linkedProduct === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedProduct'],
      message: 'linkedProduct must agree with masterProductId',
    });
  }
  if (
    row.listing.masterProductId !== null
    && row.linkedProduct !== null
    && row.listing.masterProductId !== row.linkedProduct.id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedProduct', 'id'],
      message: 'linkedProduct id must equal masterProductId',
    });
  }
});
export type ChannelProductMatchingQueueRow = z.infer<
  typeof ChannelProductMatchingQueueRowSchema
>;

export const ChannelOptionRecipeStatusSchema = z.enum([
  'unmatched',
  'matched',
  'configuration_required',
  'review_required',
]);
export type ChannelOptionRecipeStatus = z.infer<
  typeof ChannelOptionRecipeStatusSchema
>;

export const ChannelOptionMatchingQueueRowSchema = z.object({
  channelAccount: ChannelMatchingAccountSchema,
  listing: z.object({
    id: z.string().uuid(),
    externalId: z.string().min(1),
    masterProductId: z.string().uuid().nullable(),
  }).strict(),
  option: z.object({
    id: z.string().uuid(),
    externalOptionId: z.string().min(1),
    itemName: z.string().nullable(),
    sellerSku: z.string().nullable(),
    barcode: z.string().nullable(),
    productVariantId: z.string().uuid().nullable(),
    updatedAt: zIsoDate,
  }).strict(),
  linkedVariant: z.object({
    id: z.string().uuid(),
    masterProductId: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    optionLabel: z.string().nullable(),
  }).strict().nullable(),
  recipeStatus: ChannelOptionRecipeStatusSchema,
  capacity: z.number().int().nonnegative().nullable(),
}).strict().superRefine((row, ctx) => {
  if ((row.option.productVariantId === null) !== (row.linkedVariant === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedVariant'],
      message: 'linkedVariant must agree with productVariantId',
    });
  }
  if (row.option.productVariantId !== null && row.listing.masterProductId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['option', 'productVariantId'],
      message: 'An option cannot be linked while its listing is unmatched',
    });
  }
  if (
    row.option.productVariantId !== null
    && row.linkedVariant !== null
    && row.option.productVariantId !== row.linkedVariant.id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedVariant', 'id'],
      message: 'linkedVariant id must equal productVariantId',
    });
  }
  if (
    row.listing.masterProductId !== null
    && row.linkedVariant !== null
    && row.listing.masterProductId !== row.linkedVariant.masterProductId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedVariant', 'masterProductId'],
      message: 'linkedVariant must belong to the linked listing product',
    });
  }
  if (row.recipeStatus === 'unmatched') {
    if (row.option.productVariantId !== null || row.linkedVariant !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeStatus'],
        message: 'unmatched options cannot have a linked variant',
      });
    }
    if (row.capacity !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacity'],
        message: 'unmatched options cannot have capacity',
      });
    }
    return;
  }
  if (row.option.productVariantId === null || row.linkedVariant === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipeStatus'],
      message: `${row.recipeStatus} options require a linked variant`,
    });
  }
  if (row.recipeStatus === 'matched' && row.capacity === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capacity'],
      message: 'matched options require capacity',
    });
  }
  if (row.recipeStatus !== 'matched' && row.capacity !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capacity'],
      message: `${row.recipeStatus} options cannot have capacity`,
    });
  }
});
export type ChannelOptionMatchingQueueRow = z.infer<
  typeof ChannelOptionMatchingQueueRowSchema
>;

export const ChannelProductMatchingCountsSchema = z.object({
  products: z.object({
    all: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    unlinked: z.number().int().nonnegative(),
  }).strict(),
  options: z.object({
    all: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    unlinked: z.number().int().nonnegative(),
    recipeConfirmed: z.number().int().nonnegative(),
    configurationRequired: z.number().int().nonnegative(),
    reviewRequired: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((counts, ctx) => {
  if (counts.products.linked + counts.products.unlinked !== counts.products.all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['products'],
      message: 'linked and unlinked products must equal all products',
    });
  }
  if (counts.options.linked + counts.options.unlinked !== counts.options.all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'linked and unlinked options must equal all options',
    });
  }
  if (
    counts.options.recipeConfirmed
    + counts.options.configurationRequired
    + counts.options.reviewRequired
    !== counts.options.linked
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'recipe states must equal linked options',
    });
  }
});
export type ChannelProductMatchingCounts = z.infer<
  typeof ChannelProductMatchingCountsSchema
>;

export const ChannelRecipeSuggestionStatusSchema = z.enum([
  'already_configured',
  'unique_code',
  'unique_barcode',
  'exact_name_option',
  'quantity_review',
  'conflict',
  'ambiguous',
  'name_review_only',
  'no_match',
]);
export type ChannelRecipeSuggestionStatus = z.infer<
  typeof ChannelRecipeSuggestionStatusSchema
>;

export const ChannelRecipeSuggestionEvidenceSchema = z.object({
  kind: z.enum([
    'seller_sku_code',
    'model_number_code',
    'physical_barcode',
    'normalized_name',
    'normalized_name_option',
  ]),
  channelValue: z.string().min(1),
  normalizedValue: z.string().min(1),
}).strict();
export type ChannelRecipeSuggestionEvidence = z.infer<
  typeof ChannelRecipeSuggestionEvidenceSchema
>;

export const ChannelRecipeSuggestionResponseSchema = z.object({
  channelListingOptionId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable(),
  masterProductId: z.string().uuid().nullable(),
  status: ChannelRecipeSuggestionStatusSchema,
  automationDecision: ChannelRecipeAutomationDecisionSchema,
  recommendedQuantity: z.number().int().positive().nullable(),
  reason: z.string().min(1),
  existingComponents: z.array(z.object({
    sellpiaInventorySkuId: z.string().uuid(),
    code: z.string().min(1),
    quantity: z.number().int().positive(),
    source: z.enum(['manual', 'deterministic']),
    confirmedBy: z.string().uuid().nullable(),
    confirmedAt: zIsoDate,
  }).strict()),
  proposals: z.array(z.object({
    sellpiaInventorySkuId: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    optionName: z.string().min(1).nullable(),
    currentStock: z.number().int(),
    evidence: z.array(ChannelRecipeSuggestionEvidenceSchema),
    requiresQuantityConfirmation: z.boolean(),
    recommendedQuantity: z.number().int().positive().nullable(),
  }).strict()),
}).strict().superRefine((response, ctx) => {
  if (response.status === 'already_configured' && response.proposals.length !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposals'],
      message: 'already configured recipes cannot include proposals',
    });
  }
  if (
    response.status === 'already_configured'
    && response.automationDecision !== 'already_configured'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['automationDecision'],
      message: 'already configured recipes require the already_configured decision',
    });
  }
  if (response.automationDecision === 'auto_apply') {
    const proposal = response.proposals[0];
    if (
      response.proposals.length !== 1
      || response.recommendedQuantity !== 1
      || proposal?.requiresQuantityConfirmation !== false
      || proposal.recommendedQuantity !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposals'],
        message: 'automatic recipes require exactly one quantity-one proposal',
      });
    }
  }
});
export type ChannelRecipeSuggestionResponse = z.infer<
  typeof ChannelRecipeSuggestionResponseSchema
>;

export const ChannelProductMatchingQueueResponseSchema = z.object({
  products: z.array(ChannelProductMatchingQueueRowSchema),
  options: z.array(ChannelOptionMatchingQueueRowSchema),
  counts: ChannelProductMatchingCountsSchema,
}).strict();
export type ChannelProductMatchingQueueResponse = z.infer<
  typeof ChannelProductMatchingQueueResponseSchema
>;

export const ChannelProductCandidateListResponseSchema = z.object({
  items: z.array(ChannelProductMatchCandidateSchema),
}).strict();
export type ChannelProductCandidateListResponse = z.infer<
  typeof ChannelProductCandidateListResponseSchema
>;

export const ChannelVariantCandidateListResponseSchema = z.object({
  items: z.array(ChannelVariantMatchCandidateSchema),
}).strict();
export type ChannelVariantCandidateListResponse = z.infer<
  typeof ChannelVariantCandidateListResponseSchema
>;

export const LinkChannelListingProductInputSchema = z.object({
  masterProductId: z.string().uuid().nullable(),
}).strict();
export type LinkChannelListingProductInput = z.infer<
  typeof LinkChannelListingProductInputSchema
>;

export const LinkChannelListingOptionInputSchema = z.object({
  productVariantId: z.string().uuid().nullable(),
}).strict();
export type LinkChannelListingOptionInput = z.infer<
  typeof LinkChannelListingOptionInputSchema
>;
