import { z } from 'zod';

export const BROWSER_COLLECTION_PRODUCERS = [
  'advertising.ad_keyword',
  'advertising.ad_sync',
  'advertising.profitability_import',
  'channels.coupang_catalog',
  'dashboard.coupang_products',
  'dashboard.wing_kpi',
  'dashboard.wing_sales',
  'inventory.sellpia',
  'orders.mall',
  'orders.mall_admin_listings',
  'orders.sabangnet_mall_listings',
  'orders.sellpia_manual_match',
  'orders.sellpia_product_profitability',
  'orders.sellpia_sales',
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
export const BrowserCollectionAttentionReasonSchema = z.enum(
  BROWSER_COLLECTION_ATTENTION_REASONS,
);

// This is the owner-issued SourceImportAttempt id. An extension collection
// session must never mint a second id or invent a second lifecycle for it.
export const BrowserCollectionAttemptIdSchema = z.string().uuid();

const BoundedCountSchema = z.number().int().min(0).max(1_000_000);

export const BrowserCollectionProgressSchema = z
  .object({
    current: BoundedCountSchema,
    total: BoundedCountSchema,
    completed: BoundedCountSchema,
    failed: BoundedCountSchema,
    label: z.string().max(300).nullable(),
  })
  .strict()
  .superRefine((progress, context) => {
    if (
      progress.current > progress.total ||
      progress.completed + progress.failed > progress.total
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid progress bounds',
      });
    }
  });

export const BrowserCollectionAttentionSchema = z
  .object({
    reason: BrowserCollectionAttentionReasonSchema,
    message: z.string().min(1).max(2_000),
    canOpenTab: z.boolean(),
  })
  .strict();

export const BrowserCollectionSessionViewSchema = z
  .object({
    // Environment ownership is local extension metadata, not part of the
    // owner attempt. It remains optional for callers with one environment.
    environmentId: z.enum(['local', 'office']).optional(),
    attemptId: BrowserCollectionAttemptIdSchema,
    producer: BrowserCollectionProducerSchema,
    progress: BrowserCollectionProgressSchema,
    attention: BrowserCollectionAttentionSchema.nullable(),
  })
  .strict();

export const BrowserCollectionCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('listCollectionSessions') }).strict(),
  z
    .object({
      action: z.literal('getCollectionSession'),
      attemptId: BrowserCollectionAttemptIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('cancelCollectionSession'),
      attemptId: BrowserCollectionAttemptIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('openCollectionAttentionTab'),
      attemptId: BrowserCollectionAttemptIdSchema,
    })
    .strict(),
]);

export type BrowserCollectionProducer = z.infer<
  typeof BrowserCollectionProducerSchema
>;
export type BrowserCollectionAttemptId = z.infer<
  typeof BrowserCollectionAttemptIdSchema
>;
export type BrowserCollectionProgress = z.infer<
  typeof BrowserCollectionProgressSchema
>;
export type BrowserCollectionAttention = z.infer<
  typeof BrowserCollectionAttentionSchema
>;
export type BrowserCollectionSessionView = z.infer<
  typeof BrowserCollectionSessionViewSchema
>;
export type BrowserCollectionCommand = z.infer<
  typeof BrowserCollectionCommandSchema
>;
