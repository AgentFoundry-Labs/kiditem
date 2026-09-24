import { z } from 'zod';
import { zIsoDate } from './common.js';
import { SalesProductSchema } from './sales-product.js';

export const TargetExecutionKindSchema = z.enum(['register', 'update', 'sold_out', 'resume', 'composition_change']);
const OptionTransitionSchema = z.object({
  channelListingOptionId: z.string().uuid(),
  salesProductOptionId: z.string().uuid(),
}).strict();
export const PrepareTargetExecutionInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  kind: TargetExecutionKindSchema,
  idempotencyKey: z.string().trim().min(1).max(200),
  channelListingId: z.string().uuid().optional(),
  /** Supported price update sends only this field, never the whole registration form. */
  updateFields: z.array(z.literal('salePrice')).length(1).optional(),
  /** Execution-only provider defaults; target settings remain authoritative overrides. */
  adapterDefaults: z.record(z.string(), z.string()).optional(),
  /** Explicit values edited for this submission only; never writes reusable settings. */
  adapterValues: z.record(z.string(), z.string()).optional(),
  applyCompositionTemplate: z.boolean().default(false),
  /** Explicit old marketplace option → new common option; never match by order/name. */
  optionTransitions: z.array(OptionTransitionSchema).max(1000).optional(),
}).strict();
export type PrepareTargetExecutionInput = z.infer<typeof PrepareTargetExecutionInputSchema>;

export const TargetExecutionSnapshotSchema = z.object({
  targetId: z.string().uuid(),
  targetVersion: z.number().int().positive(),
  channelAccountId: z.string().uuid(),
  kind: TargetExecutionKindSchema,
  channelListingId: z.string().uuid().nullable(),
  updateFields: z.array(z.literal('salePrice')).length(1).optional(),
  /** Execution-only provider defaults; target settings remain authoritative overrides. */
  adapterDefaults: z.record(z.string(), z.string()).optional(),
  /** Explicit values edited for this submission only; never writes reusable settings. */
  adapterValues: z.record(z.string(), z.string()).optional(),
  applyCompositionTemplate: z.boolean(),
  optionTransitions: z.array(OptionTransitionSchema).optional(),
  product: SalesProductSchema,
  registrationInput: z.record(z.string(), z.unknown()),
  supplyPrices: z.array(z.object({ salesProductOptionId: z.string().uuid(), supplyPrice: z.number().int().min(0).max(1_000_000_000).nullable() })),
});
export type TargetExecutionSnapshot = z.infer<typeof TargetExecutionSnapshotSchema>;
export const TargetExecutionResultSchema = z.object({
  executionId: z.string().uuid(), targetId: z.string().uuid(), channelAccountId: z.string().uuid(),
  status: z.enum(['prepared', 'executing', 'reconciling', 'succeeded', 'failed', 'cancelled']),
  providerOutcome: z.enum(['not_attempted', 'uncertain', 'succeeded', 'definitive_failure']),
  payloadHash: z.string(), payload: TargetExecutionSnapshotSchema,
  leaseToken: z.string().uuid().nullable(),
  /** Only the request that atomically starts this execution may perform provider IO. */
  maySubmit: z.boolean(),
  externalListingId: z.string().nullable(),
  expectedProviderAccountId: z.string().nullable().optional(),
  result: z.unknown().nullable(),
  createdAt: zIsoDate.optional(),
}).strict();
export type TargetExecutionResult = z.infer<typeof TargetExecutionResultSchema>;
export const ReportTargetExecutionInputSchema = z.object({
  leaseToken: z.string().uuid(), payloadHash: z.string().min(1),
  outcome: z.enum(['not_submitted', 'uncertain', 'submitted', 'awaiting_approval', 'confirmed']),
  evidence: z.object({
    channelAccountId: z.string().uuid(),
    externalListingId: z.string().trim().min(1).optional(),
    observedUrl: z.string().url().optional(),
    providerAccountId: z.string().optional(),
    observedStatus: z.string().optional(),
    message: z.string().optional(),
    options: z.array(z.object({
      salesProductOptionId: z.string().uuid(),
      externalOptionId: z.string().trim().min(1),
      sellerSku: z.string().nullable().optional(),
    }).strict()).optional(),
  }).strict(),
}).strict();
export type ReportTargetExecutionInput = z.infer<typeof ReportTargetExecutionInputSchema>;
