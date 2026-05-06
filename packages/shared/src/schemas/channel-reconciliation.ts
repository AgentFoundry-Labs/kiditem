import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * `/api/channels/reconciliation/coupang/*` shared contracts.
 *
 * Reconciliation queue tracks Coupang Wing rows that have not been linked to
 * an internal `MasterProduct` / `ProductOption`. The queue is the user-visible
 * surface for unmatched / conflict / manual-link decisions. `MasterProduct`
 * is never auto-created from a Coupang row (issue #199 acceptance criteria).
 */

export const ReconciliationItemStatusSchema = z.enum([
  'linked',
  'needs_review',
  'conflict',
  'ignored',
  'stale',
]);
export type ReconciliationItemStatus = z.infer<typeof ReconciliationItemStatusSchema>;

export const ReconciliationItemTypeSchema = z.enum([
  'channel_listing',
  'channel_option',
]);
export type ReconciliationItemType = z.infer<typeof ReconciliationItemTypeSchema>;

export const ReconciliationMatchReasonSchema = z.enum([
  'external_id',
  'legacy_code_exact',
  'manual',
  'conflict',
  'none',
]);
export type ReconciliationMatchReason = z.infer<typeof ReconciliationMatchReasonSchema>;

export const ReconciliationResolutionSourceSchema = z.enum([
  'existing_external_id',
  'auto_legacy_code',
  'manual',
  'ignored',
]);
export type ReconciliationResolutionSource = z.infer<typeof ReconciliationResolutionSourceSchema>;

export const ReconciliationChannelSchema = z.enum(['coupang']);
export type ReconciliationChannel = z.infer<typeof ReconciliationChannelSchema>;

/**
 * Single row received from the Wing scrape (or any other source). The server
 * is the authority on `organizationId` — clients never send it.
 */
export const ReconciliationRowSchema = z.object({
  externalId: z.string().min(1),
  externalOptionId: z.string().min(1).nullable().optional(),
  legacyCode: z.string().min(1).nullable().optional(),
  channelProductName: z.string().nullable().optional(),
  channelOptionName: z.string().nullable().optional(),
  channelImageUrl: z.string().nullable().optional(),
  channelUrl: z.string().nullable().optional(),
  channelStatus: z.string().nullable().optional(),
});
export type ReconciliationRow = z.infer<typeof ReconciliationRowSchema>;

export const ReconciliationScanRequestSchema = z.object({
  source: z.enum(['wing_inventory', 'seller_products', 'manual']).default('wing_inventory'),
  rows: z.array(ReconciliationRowSchema).min(1).max(5_000),
});
export type ReconciliationScanRequest = z.infer<typeof ReconciliationScanRequestSchema>;

export const ReconciliationLinkRequestSchema = z.object({
  productOptionId: z.string().uuid(),
});
export type ReconciliationLinkRequest = z.infer<typeof ReconciliationLinkRequestSchema>;

export const ReconciliationIgnoreRequestSchema = z.object({
  reason: z.string().min(1).max(500).nullable().optional(),
});
export type ReconciliationIgnoreRequest = z.infer<typeof ReconciliationIgnoreRequestSchema>;

export const ReconciliationLinkedKidItemSchema = z.object({
  masterProductId: z.string().uuid().nullable(),
  masterProductName: z.string().nullable(),
  masterProductCode: z.string().nullable(),
  productOptionId: z.string().uuid().nullable(),
  productOptionName: z.string().nullable(),
  productOptionSku: z.string().nullable(),
  productOptionLegacyCode: z.string().nullable(),
});
export type ReconciliationLinkedKidItem = z.infer<typeof ReconciliationLinkedKidItemSchema>;

export const ReconciliationItemSchema = z.object({
  id: z.string().uuid(),
  channel: ReconciliationChannelSchema,
  source: z.string(),
  itemType: ReconciliationItemTypeSchema,
  status: ReconciliationItemStatusSchema,

  externalId: z.string().nullable(),
  externalOptionId: z.string().nullable(),
  legacyCode: z.string().nullable(),

  channelProductName: z.string().nullable(),
  channelOptionName: z.string().nullable(),
  channelImageUrl: z.string().nullable(),
  channelUrl: z.string().nullable(),
  channelStatus: z.string().nullable(),

  matchReason: ReconciliationMatchReasonSchema.nullable(),
  resolutionSource: ReconciliationResolutionSourceSchema.nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),

  linkedListingId: z.string().uuid().nullable(),
  linkedListingOptionId: z.string().uuid().nullable(),

  linked: ReconciliationLinkedKidItemSchema,

  ignoredReason: z.string().nullable(),
  resolvedAt: zIsoDate.nullable(),

  firstObservedAt: zIsoDate,
  lastObservedAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type ReconciliationItem = z.infer<typeof ReconciliationItemSchema>;

export const ReconciliationItemListResponseSchema = z.object({
  items: z.array(ReconciliationItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ReconciliationItemListResponse = z.infer<typeof ReconciliationItemListResponseSchema>;

export const ReconciliationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  linked: z.number().int().nonnegative(),
  autoLinked: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  lastRun: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      source: z.string(),
      totalCount: z.number().int().nonnegative(),
      autoLinkedCount: z.number().int().nonnegative(),
      needsReviewCount: z.number().int().nonnegative(),
      conflictCount: z.number().int().nonnegative(),
      startedAt: zIsoDate,
      finishedAt: zIsoDate.nullable(),
    })
    .nullable(),
});
export type ReconciliationSummary = z.infer<typeof ReconciliationSummarySchema>;

export const ReconciliationScanResponseSchema = z.object({
  runId: z.string().uuid(),
  totalCount: z.number().int().nonnegative(),
  alreadyLinkedCount: z.number().int().nonnegative(),
  autoLinkedCount: z.number().int().nonnegative(),
  needsReviewCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
});
export type ReconciliationScanResponse = z.infer<typeof ReconciliationScanResponseSchema>;
