import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelRecipeSuggestionDecisionSchema = z.enum([
  'auto_apply',
  'quantity_review',
  'operator_review',
  'blocked',
  'already_configured',
]);

export const ChannelMatchCandidateReasonSchema = z.enum([
  'existing_identity',
  'exact_code',
  'unique_barcode',
  'confirmed_manual_match_alias',
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
    confirmed_manual_match_alias: 'normalizedName',
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

export const ChannelMatchingAccountSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  name: z.string().min(1),
}).strict();
export type ChannelMatchingAccount = z.infer<typeof ChannelMatchingAccountSchema>;

const DisplayImageUrlSchema = z.string().trim().min(1).max(2_000).nullable();

export const ChannelProductMatchingQueueRowSchema = z.object({
  channelAccount: ChannelMatchingAccountSchema,
  listing: z.object({
    id: z.string().uuid(),
    externalId: z.string().min(1),
    displayName: z.string().nullable(),
    status: z.string().nullable(),
    saleStatus: z.string().nullable(),
    masterProductId: z.string().uuid().nullable(),
    channelImageUrl: DisplayImageUrlSchema,
    updatedAt: zIsoDate,
  }).strict(),
  linkedProduct: z.object({
    id: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    displayImageUrl: DisplayImageUrlSchema,
  }).strict().nullable(),
  optionCount: z.number().int().nonnegative(),
  configuredOptionCount: z.number().int().nonnegative(),
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

export const ChannelOptionInventoryComponentSchema = z.object({
  id: z.string().uuid(),
  masterProductId: z.string().uuid(),
  code: z.string().min(1).nullable(),
  name: z.string().min(1).nullable(),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive(),
}).strict();
export type ChannelOptionInventoryComponent = z.infer<
  typeof ChannelOptionInventoryComponentSchema
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
    updatedAt: zIsoDate,
    inventoryComponents: z.array(ChannelOptionInventoryComponentSchema).max(50),
  }).strict(),
  capacity: z.number().int().nonnegative().nullable(),
}).strict().superRefine((row, ctx) => {
  if (row.option.inventoryComponents.length === 0 && row.capacity !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capacity'],
      message: 'An option without inventory components cannot have capacity',
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
    configured: z.number().int().nonnegative(),
    unconfigured: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((counts, ctx) => {
  if (counts.products.linked + counts.products.unlinked !== counts.products.all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['products'],
      message: 'linked and unlinked products must equal all products',
    });
  }
  if (counts.options.configured + counts.options.unconfigured !== counts.options.all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'configured and unconfigured options must equal all options',
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
  'confirmed_manual_match_alias',
  'exact_name_option',
  'exact_name',
  'high_confidence_name',
  'identifier_name_mismatch',
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
    'sellpia_manual_match_alias',
    'normalized_name',
    'normalized_name_option',
    'contained_name',
    'fuzzy_name',
  ]),
  channelValue: z.string().min(1),
  normalizedValue: z.string().min(1),
  score: z.number().min(0).max(1).optional(),
}).strict();
export type ChannelRecipeSuggestionEvidence = z.infer<
  typeof ChannelRecipeSuggestionEvidenceSchema
>;

export const ChannelRecipeSuggestionResponseSchema = z.object({
  channelListingOptionId: z.string().uuid(),
  masterProductId: z.string().uuid().nullable(),
  status: ChannelRecipeSuggestionStatusSchema,
  automationDecision: ChannelRecipeSuggestionDecisionSchema,
  recommendedQuantity: z.number().int().positive().nullable(),
  reason: z.string().min(1),
  existingComponents: z.array(z.object({
    masterProductId: z.string().uuid(),
    code: z.string().min(1),
    quantity: z.number().int().positive(),
    source: z.enum(['manual', 'deterministic']),
    confirmedBy: z.string().uuid().nullable(),
    confirmedAt: zIsoDate,
  }).strict()),
  proposals: z.array(z.object({
    masterProductId: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    optionName: z.string().min(1).nullable(),
    currentStock: z.number().int().nonnegative().nullable(),
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
      || response.recommendedQuantity === null
      || proposal?.requiresQuantityConfirmation !== false
      || proposal.recommendedQuantity !== response.recommendedQuantity
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposals'],
        message: 'automatic recipes require exactly one positive-quantity proposal',
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

export const LinkChannelListingProductInputSchema = z.object({
  masterProductId: z.string().uuid().nullable(),
}).strict();
export type LinkChannelListingProductInput = z.infer<
  typeof LinkChannelListingProductInputSchema
>;

export const ChannelProductAutoMatchResponseSchema = z.object({
  evaluatedListings: z.number().int().nonnegative(),
  matchedListings: z.number().int().nonnegative(),
  configuredOptions: z.number().int().nonnegative(),
}).strict();
export type ChannelProductAutoMatchResponse = z.infer<
  typeof ChannelProductAutoMatchResponseSchema
>;
