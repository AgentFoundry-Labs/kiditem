import { z } from 'zod';

const InstantSchema = z.string().datetime({ offset: true });

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
    sourcePlatform: z.string().min(1).max(60),
    externalOfferId: z.string().min(1).max(200),
    variantKey: z.string().max(300),
    rank: z.number().int().positive(),
    score: z.number().int().min(0).max(100),
    grade: z.enum(['A', 'B', 'C', 'WATCH']),
    baselineAction: z.enum(['order', 'observe_3d', 'exclude']),
    reasonCodes: z.array(z.string().min(1).max(100)).max(50),
    riskCodes: z.array(z.string().min(1).max(100)).max(50),
  })
  .strict();

export const SourcingReviewSelectionCommandSchema = z
  .object({
    workspaceKey: z.enum(['entry', 'final']),
    recommendationRunId: z.string().uuid(),
    itemKey: z.string().regex(/^[a-f0-9]{64}$/),
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
