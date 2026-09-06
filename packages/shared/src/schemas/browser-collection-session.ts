import { z } from 'zod';

export const BROWSER_COLLECTION_PRODUCERS = [
  'dashboard.wing_sales',
  'dashboard.coupang_ads',
  'dashboard.coupang_products',
  'dashboard.wing_kpi',
  'advertising.ad_sync',
  'advertising.ad_keyword',
  'advertising.scrape_targets',
  'advertising.wing_rank',
  'advertising.keyword_rank',
  'advertising.competitor_catalog',
  'advertising.competitor_seller_identity',
  'channels.coupang_catalog',
  'sourcing.wing_catalog',
  'sourcing.1688_trend',
  'sourcing.live_commerce',
  'sourcing.tiktok_cc_trend',
  'orders.mall',
  'orders.coupang_shipment_summary',
  'orders.coupang_rocket_po',
  'inventory.sellpia',
  'orders.sellpia_manual_match',
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
