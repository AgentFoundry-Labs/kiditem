import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });

/** The frozen plan of one Wing item-winner capture for one Coupang account. */
export const WingItemwinnerSourcePlanSchema = z.object({
  sourceType: z.literal('coupang_wing_itemwinner'),
  parserVersion: z.literal('wing-itemwinner-v1'),
  channelAccountId: z.string().uuid(),
  expectedVendorId: z.string().min(1),
  businessDate: z.string().date(),
  pageType: z.literal('itemwinner'),
  /** The Wing page the owner froze at admission; the capture must report exactly this page. */
  targetUrl: z.string().url().max(2_048),
});

/** One attempt as every public read shows it; the attempt token is never part of it. */
export const WingItemwinnerSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  generation: z.string().regex(/^\d+$/),
  /** An expired RUNNING attempt reads as FAILED with ATTEMPT_EXPIRED. */
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: WingItemwinnerSourcePlanSchema,
  expiresAt: timestamp,
  actualCutoffAt: timestamp.nullable(),
  observedAt: timestamp.nullable(),
  contentChecksum: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

/**
 * GET /api/ads/wing-itemwinner/source: the attempts of the account named by
 * `channelAccountId`, or of the primary Coupang account when none is named.
 */
export const WingItemwinnerSourceStatusSchema = z.object({
  channelAccountId: z.string().uuid().nullable(),
  ready: z.boolean(),
  latestAttempt: WingItemwinnerSourceAttemptSchema.nullable(),
  latestComplete: WingItemwinnerSourceAttemptSchema.nullable(),
  actualCutoffAt: timestamp.nullable(),
});

export type WingItemwinnerSourcePlan = z.infer<typeof WingItemwinnerSourcePlanSchema>;
export type WingItemwinnerSourceAttempt = z.infer<typeof WingItemwinnerSourceAttemptSchema>;
export type WingItemwinnerSourceStatus = z.infer<typeof WingItemwinnerSourceStatusSchema>;
