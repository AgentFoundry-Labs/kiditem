import { z } from 'zod';

export const BROWSER_COLLECTION_PRODUCERS = [
  'dashboard.wing_sales',
  'dashboard.rocket_sales',
  'dashboard.coupang_ads',
  'dashboard.coupang_products',
  'dashboard.wing_kpi',
  'advertising.ad_sync',
  'advertising.scrape_targets',
  'advertising.wing_rank',
  'advertising.keyword_rank',
  'advertising.competitor_catalog',
  'channels.coupang_catalog',
  'sourcing.wing_catalog',
  'sourcing.1688_trend',
  'sourcing.live_commerce',
  'sourcing.tiktok_cc_trend',
  'orders.mall',
  'inventory.sellpia',
] as const;

export const BROWSER_COLLECTION_STATES = [
  'idle',
  'running',
  'attention_required',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const BROWSER_COLLECTION_ATTENTION_REASONS = [
  'extension_missing',
  'extension_outdated',
  'kiditem_auth',
  'marketplace_login',
  'captcha',
  'permission',
  'background_timeout',
  'rate_limited',
  'manual_confirmation',
  'unknown',
] as const;

export const BrowserCollectionProducerSchema = z.enum(
  BROWSER_COLLECTION_PRODUCERS,
);
export const BrowserCollectionStateSchema = z.enum(BROWSER_COLLECTION_STATES);
export const BrowserCollectionClassificationSchema = z.enum([
  'background_safe',
  'background_preferred',
  'interactive_only',
]);
export const BrowserCollectionAttentionReasonSchema = z.enum(
  BROWSER_COLLECTION_ATTENTION_REASONS,
);
export const BrowserCollectionRunIdSchema = z.string().uuid();

const InputValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const SecretIdentityKeyPattern =
  /response|body|html|token|password|secret|cookie|credential|file|rows|payload/i;
const InputIdentitySchema = z
  .record(z.string().min(1).max(80), InputValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 20) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Too many identity fields',
      });
    }
    for (const key of Object.keys(value)) {
      if (SecretIdentityKeyPattern.test(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Secret identity field is not allowed: ${key}`,
        });
      }
    }
  });

export const BrowserCollectionSessionViewSchema = z
  .object({
    runId: BrowserCollectionRunIdSchema,
    producer: BrowserCollectionProducerSchema,
    classification: BrowserCollectionClassificationSchema.exclude([
      'interactive_only',
    ]),
    status: BrowserCollectionStateSchema,
    attempt: z.number().int().min(1),
    restartStrategy: z.enum(['extension', 'web']),
    progress: z
      .object({
        current: z.number().int().min(0),
        total: z.number().int().min(0),
        completed: z.number().int().min(0),
        failed: z.number().int().min(0),
        label: z.string().max(300).nullable(),
      })
      .strict(),
    inputIdentity: InputIdentitySchema,
    attention: z
      .object({
        reason: BrowserCollectionAttentionReasonSchema,
        message: z.string().min(1).max(2000),
        canOpenTab: z.boolean(),
      })
      .strict()
      .nullable(),
    startedAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    finishedAt: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((session, context) => {
    if (
      session.progress.current > session.progress.total ||
      session.progress.completed + session.progress.failed >
        session.progress.total
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid progress bounds',
      });
    }
    if (session.status === 'attention_required' && session.attention === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Attention details are required',
      });
    }
    if (session.status !== 'attention_required' && session.attention !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unexpected attention details',
      });
    }
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(
      session.status,
    );
    if (terminal !== (session.finishedAt !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid terminal timestamp',
      });
    }
  });

export const BrowserCollectionCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('listCollectionSessions') }).strict(),
  z
    .object({
      action: z.literal('getCollectionSession'),
      runId: BrowserCollectionRunIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('cancelCollectionSession'),
      runId: BrowserCollectionRunIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('openCollectionAttentionTab'),
      runId: BrowserCollectionRunIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('restartCollectionSession'),
      runId: BrowserCollectionRunIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('finalizeCollectionSession'),
      runId: BrowserCollectionRunIdSchema,
      status: z.enum(['succeeded', 'failed']),
      message: z.string().min(1).max(300),
    })
    .strict(),
]);

export type BrowserCollectionProducer = z.infer<
  typeof BrowserCollectionProducerSchema
>;
export type BrowserCollectionState = z.infer<
  typeof BrowserCollectionStateSchema
>;
export type BrowserCollectionSessionView = z.infer<
  typeof BrowserCollectionSessionViewSchema
>;
export type BrowserCollectionCommand = z.infer<
  typeof BrowserCollectionCommandSchema
>;
