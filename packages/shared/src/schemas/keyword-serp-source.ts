import { z } from 'zod';
import { zIsoDate } from './common';

const timestamp = zIsoDate
  .transform((value) => (value instanceof Date ? value.toISOString() : value))
  .pipe(z.string().datetime());

export const KeywordSerpSourceBeginSchema = z
  .object({
    keyword: z.string().trim().min(1),
    maxPages: z.preprocess((value) => {
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.max(1, Math.min(3, Math.floor(number)))
        : 2;
    }, z.number().int().min(1).max(3)),
  })
  .strict();
export type KeywordSerpSourceBegin = z.infer<
  typeof KeywordSerpSourceBeginSchema
>;

export const KeywordSerpSourcePlanSchema = z
  .object({
    sourceType: z.literal('coupang_keyword_serp'),
    parserVersion: z.literal('keyword-serp-v1'),
    keyword: z.string().min(1),
    maxPages: z.number().int().min(1).max(3),
    explicitVendorItemIds: z.array(z.string()),
    ownItems: z.array(
      z.object({ vendorItemId: z.string(), productName: z.string() }).strict(),
    ),
  })
  .strict();
export type KeywordSerpSourcePlan = z.infer<typeof KeywordSerpSourcePlanSchema>;

export const KeywordSerpCaptureSchema = z
  .object({
    keyword: z.string().trim().min(1),
    capturedAt: timestamp,
    pagesScanned: z.number().int().nonnegative(),
    items: z.array(z.unknown()),
    pagination: z
      .object({
        requestedMaxPages: z.number().int(),
        stoppedAtPage: z.number().int(),
        stopReason: z.enum([
          'page_limit',
          'empty_page',
          'load_failed',
          'redirect',
          'extraction_failed',
          'provider_wall',
          'invalid_result',
        ]),
      })
      .strict(),
    usedFallback: z.boolean().optional(),
    wall: z.string().nullable().optional(),
  })
  .strict();
export type KeywordSerpCapture = z.infer<typeof KeywordSerpCaptureSchema>;

export const KeywordSerpSourceAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    keyword: z.string(),
    generation: z.string().regex(/^\d+$/),
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: KeywordSerpSourcePlanSchema,
    expiresAt: timestamp,
    actualCutoffAt: timestamp.nullable(),
    itemCount: z.number().int().nonnegative(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();
export type KeywordSerpSourceAttempt = z.infer<
  typeof KeywordSerpSourceAttemptSchema
>;
export const KeywordSerpSourceControlSchema =
  KeywordSerpSourceAttemptSchema.extend({
    attemptToken: z.string().uuid(),
  }).strict();
export type KeywordSerpSourceControl = z.infer<
  typeof KeywordSerpSourceControlSchema
>;
export const KeywordSerpSourceSchema = z
  .object({
    status: z.enum(['READY', 'STALE', 'MISSING']),
    refreshing: z.boolean(),
    latestAttempt: KeywordSerpSourceAttemptSchema.nullable(),
    latestComplete: KeywordSerpSourceAttemptSchema.nullable(),
  })
  .strict();
export type KeywordSerpSource = z.infer<typeof KeywordSerpSourceSchema>;
