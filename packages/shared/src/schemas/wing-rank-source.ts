import { z } from 'zod';
import { zIsoDate } from './common';
import {
  KeywordSerpSourceAttemptSchema,
  KeywordSerpSourceSchema,
} from './keyword-serp-source';

export const WingRankSourceBeginSchema = z
  .object({
    keyword: z.string().trim().min(1),
    maxPages: z.preprocess((value) => {
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.max(1, Math.min(5, Math.floor(number)))
        : 5;
    }, z.number().int().min(1).max(5)),
  })
  .strict();
export type WingRankSourceBegin = z.infer<typeof WingRankSourceBeginSchema>;

export const WingRankSourcePlanSchema = z
  .object({
    sourceType: z.literal('coupang_wing_rank'),
    parserVersion: z.literal('wing-rank-v1'),
    keyword: z.string().min(1),
    maxPages: z.number().int().min(1).max(5),
    targets: z
      .array(
        z
          .object({
            vendorItemId: z.string(),
            productName: z.string(),
            category: z.string().nullable(),
            keyword: z.string(),
            candidateIndex: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type WingRankSourcePlan = z.infer<typeof WingRankSourcePlanSchema>;

export const WingRankCaptureSchema = z
  .object({
    keyword: z.string().trim().min(1),
    capturedAt: zIsoDate
      .transform((value) =>
        value instanceof Date ? value.toISOString() : value,
      )
      .pipe(z.string().datetime()),
    pagesScanned: z.number().int().nonnegative(),
    collectedCount: z.number().int().nonnegative(),
    totalResults: z.number().int().nonnegative().nullable(),
    items: z.array(z.unknown()),
    proof: z
      .object({
        maxPages: z.number().int(),
        stopReason: z.enum([
          'max_pages_reached',
          'empty_page',
          'no_next_search_page',
          'next_page_not_advancing',
          'authentication_token_missing',
          'non_json_response',
        ]),
        pages: z.array(
          z
            .object({
              searchPage: z.number().int(),
              itemCount: z.number().int().nonnegative(),
              nextSearchPage: z.number().int().nullable(),
              resultArrayObserved: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
export type WingRankCapture = z.infer<typeof WingRankCaptureSchema>;

export const WingRankSourceAttemptSchema = KeywordSerpSourceAttemptSchema.omit({
  plan: true,
}).extend({ plan: WingRankSourcePlanSchema });
export type WingRankSourceAttempt = z.infer<typeof WingRankSourceAttemptSchema>;
export const WingRankSourceControlSchema = WingRankSourceAttemptSchema.extend({
  attemptToken: z.string().uuid(),
});
export type WingRankSourceControl = z.infer<typeof WingRankSourceControlSchema>;
export const WingRankSourceSchema = KeywordSerpSourceSchema.omit({
  latestAttempt: true,
  latestComplete: true,
}).extend({
  latestAttempt: WingRankSourceAttemptSchema.nullable(),
  latestComplete: WingRankSourceAttemptSchema.nullable(),
});
export type WingRankSource = z.infer<typeof WingRankSourceSchema>;
