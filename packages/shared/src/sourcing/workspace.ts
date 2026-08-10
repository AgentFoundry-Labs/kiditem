import { z } from 'zod';

const InstantSchema = z.string().datetime({ offset: true });

export const RecommendationSurfaceSchema = z.enum(['home', 'today', 'entry', 'final']);
export type RecommendationSurface = z.infer<typeof RecommendationSurfaceSchema>;

export const ReviewWorkspaceKeySchema = z.enum(['entry', 'final']);
export type ReviewWorkspaceKey = z.infer<typeof ReviewWorkspaceKeySchema>;

const SourcingCoupangObservationItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    itemId: z.string().trim().max(200).nullable(),
    vendorItemId: z.string().trim().max(200).nullable(),
    productName: z.string().trim().min(1).max(500),
    sourceKeyword: z.string().trim().min(1).max(200),
    salePriceKrw: z.number().int().nonnegative().nullable(),
    ratingCount: z.number().int().nonnegative().nullable(),
    ratingAverage: z.number().min(0).max(5).nullable(),
    viewsLast28d: z.number().int().nonnegative().nullable(),
    salesLast28d: z.number().int().nonnegative().nullable(),
    capturedAt: InstantSchema,
  })
  .strict();

export const SourcingCoupangObservationCommandSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    items: z.array(SourcingCoupangObservationItemSchema).min(1).max(100),
  })
  .strict();

export type SourcingCoupangObservationCommand = z.infer<
  typeof SourcingCoupangObservationCommandSchema
>;

const SourcingWarningSchema = z
  .object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
  })
  .strict();

const SourcingErrorSchema = z
  .object({
    code: z.string().min(1).max(100),
    retryable: z.boolean(),
    message: z.string().min(1).max(500),
  })
  .strict();

const SourcingReadEnvelopeBaseSchema = z
  .object({
    status: z.enum(['ready', 'collecting', 'stale', 'unavailable']),
    generatedAt: InstantSchema,
    lastSuccessfulAt: InstantSchema.nullable(),
    freshUntil: InstantSchema.nullable(),
    operationId: z.string().uuid().nullable(),
    warnings: z.array(SourcingWarningSchema).max(100),
    error: SourcingErrorSchema.nullable(),
  })
  .strict();

export function sourcingReadEnvelopeSchema<TSchema extends z.ZodTypeAny>(
  dataSchema: TSchema,
) {
  return SourcingReadEnvelopeBaseSchema.extend({
    data: dataSchema.nullable(),
  }).superRefine((value, context) => {
    if (value.status === 'unavailable' && value.data !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'unavailable data must be null',
      });
    }
    if (value.status === 'ready' && value.data === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'ready data is required',
      });
    }
    if (value.status === 'ready' && value.error !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error'],
        message: 'ready response cannot contain an error',
      });
    }
  });
}

export const SourcingReadEnvelopeSchema = sourcingReadEnvelopeSchema(
  z.unknown(),
);

export const SourcingRecommendationItemSchema = z
  .object({
    itemKey: z.string().regex(/^[a-f0-9]{64}$/),
    sourcePlatform: z.enum(['1688', 'coupang']),
    externalOfferId: z.string().min(1).max(200),
    variantKey: z.string().max(300),
    rank: z.number().int().positive(),
    score: z.number().int().min(0).max(100),
    grade: z.enum(['A', 'B', 'C', 'WATCH']),
    baselineAction: z.enum(['order', 'observe_3d', 'exclude']),
    reasonCodes: z.array(z.string().min(1).max(100)).max(50),
    riskCodes: z.array(z.string().min(1).max(100)).max(50),
    displayName: z.string().trim().min(1).max(500),
    keyword: z.string().trim().min(1).max(200).nullable(),
    isNewKeyword: z.boolean(),
    imageUrl: z.string().max(2_000).nullable(),
    sourceUrl: z.string().max(2_000).nullable(),
    overseasPriceCny: z.number().nonnegative().nullable(),
    overseasPriceKrw: z.number().int().nonnegative().nullable(),
    salePriceKrw: z.number().int().nonnegative().nullable(),
    supplierName: z.string().trim().min(1).max(500).nullable(),
    monthlySales: z.number().nonnegative().nullable(),
    repurchaseRate: z.string().trim().min(1).max(100).nullable(),
    tradeScore: z.number().nonnegative().nullable(),
    minOrderQuantity: z.number().nonnegative().nullable(),
    estimatedMarginRate: z.number().nullable(),
    estimatedProfitKrw: z.number().int().nullable(),
    shippingLabel: z.string().trim().min(1).max(500).nullable(),
    rating: z.number().nonnegative().nullable(),
    tags: z.array(z.string().trim().min(1).max(200)).max(50),
    sourceKeywords: z.array(z.string().trim().min(1).max(200)).max(100),
    offerObservationIds: z.array(z.string().uuid()).max(100),
    evidenceObservationIds: z.array(z.string().uuid()).max(100),
    scoreComponents: z.record(z.number().finite()),
    coupang: z
      .object({
        productId: z.string().trim().min(1).max(200),
        productName: z.string().trim().min(1).max(500),
        salePriceKrw: z.number().int().nonnegative().nullable(),
        ratingCount: z.number().int().nonnegative().nullable(),
        ratingAverage: z.number().min(0).max(5).nullable(),
        viewsLast28d: z.number().int().nonnegative().nullable(),
        salesLast28d: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    interest: z
      .object({
        tier: z.enum(['exact', 'related']),
        keywords: z.array(z.string().trim().min(1).max(200)).max(100),
        origins: z.array(z.enum(['saved', 'seed'])).max(2),
        matches: z
          .array(
            z
              .object({
                keyword: z.string().trim().min(1).max(200),
                tier: z.enum(['exact', 'related']),
              })
              .strict(),
          )
          .max(100),
      })
      .strict()
      .nullable(),
    contributingSources: z.array(z.string().trim().min(1).max(100)).max(20),
  })
  .strict();

export const SourcingReviewSelectionCommandSchema = z
  .object({
    workspaceKey: z.enum(['entry', 'final']),
    recommendationRunId: z.string().uuid(),
    state: z.enum(['neutral', 'selected', 'removed']),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export const SourcingReviewSelectionSchema = z
  .object({
    workspaceKey: z.enum(['entry', 'final']),
    recommendationRunId: z.string().uuid(),
    itemKey: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(['neutral', 'selected', 'removed']),
    version: z.number().int().positive(),
    updatedAt: InstantSchema,
  })
  .strict();

export const SourcingReviewBatchCommandSchema = z
  .object({
    recommendationRunId: z.string().uuid(),
    itemKeys: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(100),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const SourcingReviewBatchSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['awaiting_procurement_enablement', 'cancelled']),
    itemCount: z.number().int().nonnegative(),
    createdAt: InstantSchema,
  })
  .strict();

export const SourcingValidationCheckSchema = z
  .object({
    checkKey: z.string().trim().min(1).max(120),
    status: z.enum(['pass', 'fail', 'missing', 'pending', 'not_applicable']),
    summary: z.string().max(2_000).nullable(),
  })
  .strict();

export const SourcingValidationItemSchema = z
  .object({
    episodeId: z.string().uuid(),
    recommendationRunId: z.string().uuid(),
    itemKey: z.string().regex(/^[a-f0-9]{64}$/),
    displayName: z.string().trim().min(1).max(500),
    imageUrl: z.string().url().nullable(),
    status: z.enum(['pending', 'observing', 'ready_for_review', 'blocked', 'failed']),
    score: z.number().int().min(0).max(100).nullable(),
    landedCostKrw: z.number().int().nonnegative().nullable(),
    expectedMarginBps: z.number().int().nullable(),
    validUntil: InstantSchema.nullable(),
    checks: z.array(SourcingValidationCheckSchema).max(50),
  })
  .strict();

export const SourcingValidationEnvelopeSchema = sourcingReadEnvelopeSchema(
  z
    .object({
      recommendationRunId: z.string().uuid(),
      items: z.array(SourcingValidationItemSchema).max(100),
      nextCursor: z.string().max(1_000).nullable(),
    })
    .strict(),
);

export const SourcingReviewSelectionListSchema = z
  .array(SourcingReviewSelectionSchema)
  .max(200);

export const SourcingKeywordPreferenceCommandSchema = z
  .object({
    excluded: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export const SourcingKeywordPreferenceSchema = z
  .object({
    keyword: z.string().trim().min(1).max(200),
    excluded: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: InstantSchema,
  })
  .strict();

export const SourcingKeywordPreferenceListSchema = z
  .array(SourcingKeywordPreferenceSchema)
  .max(1_000);

export const SourcingInterestTargetTypeSchema = z.enum([
  'keyword',
  'category',
  'product',
]);

export const SourcingInterestSourceSchema = z.enum([
  'keyword_analysis',
  'today_recommendation',
  'wing_catalog',
  'manual',
]);

export const SourcingInterestTargetCommandSchema = z
  .object({
    targetType: SourcingInterestTargetTypeSchema,
    source: SourcingInterestSourceSchema,
    label: z.string().trim().min(1).max(300).optional(),
    keyword: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(200).optional(),
    productId: z.string().trim().min(1).max(200).optional(),
    itemId: z.string().trim().min(1).max(200).nullable().optional(),
    vendorItemId: z.string().trim().min(1).max(200).nullable().optional(),
    productName: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const SourcingInterestTargetSchema = z
  .object({
    id: z.string().uuid(),
    targetType: SourcingInterestTargetTypeSchema,
    label: z.string().trim().min(1).max(300),
    sourceKeys: z.array(SourcingInterestSourceSchema).min(1).max(10),
    keyword: z.string().trim().min(1).max(200).nullable(),
    category: z.string().trim().min(1).max(200).nullable(),
    productId: z.string().trim().min(1).max(200).nullable(),
    itemId: z.string().trim().min(1).max(200).nullable(),
    vendorItemId: z.string().trim().min(1).max(200).nullable(),
    productName: z.string().trim().min(1).max(500).nullable(),
    enabled: z.boolean(),
    version: z.number().int().positive(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
  })
  .strip();

export const SourcingInterestTargetListSchema = z
  .array(SourcingInterestTargetSchema)
  .max(1_000);

export const SourcingRecommendationEnvelopeSchema = sourcingReadEnvelopeSchema(
  z
    .object({
      runId: z.string().uuid(),
      items: z.array(SourcingRecommendationItemSchema).max(100),
      nextCursor: z.string().max(1_000).nullable(),
    })
    .strict(),
);

export type SourcingReadEnvelope = z.infer<typeof SourcingReadEnvelopeSchema>;
export type SourcingRecommendationItem = z.infer<
  typeof SourcingRecommendationItemSchema
>;
export type SourcingRecommendationEnvelope = z.infer<
  typeof SourcingRecommendationEnvelopeSchema
>;
export type SourcingReviewSelection = z.infer<
  typeof SourcingReviewSelectionSchema
>;
export type SourcingReviewSelectionCommand = z.infer<
  typeof SourcingReviewSelectionCommandSchema
>;
export type SourcingReviewBatchCommand = z.infer<
  typeof SourcingReviewBatchCommandSchema
>;
export type SourcingReviewBatch = z.infer<typeof SourcingReviewBatchSchema>;
export type SourcingValidationCheck = z.infer<typeof SourcingValidationCheckSchema>;
export type SourcingValidationItem = z.infer<typeof SourcingValidationItemSchema>;
export type SourcingValidationEnvelope = z.infer<typeof SourcingValidationEnvelopeSchema>;
export type SourcingKeywordPreferenceCommand = z.infer<
  typeof SourcingKeywordPreferenceCommandSchema
>;
export type SourcingKeywordPreference = z.infer<typeof SourcingKeywordPreferenceSchema>;
export type SourcingInterestTargetType = z.infer<
  typeof SourcingInterestTargetTypeSchema
>;
export type SourcingInterestSource = z.infer<typeof SourcingInterestSourceSchema>;
export type SourcingInterestTargetCommand = z.infer<
  typeof SourcingInterestTargetCommandSchema
>;
export type SourcingInterestTarget = z.infer<typeof SourcingInterestTargetSchema>;
