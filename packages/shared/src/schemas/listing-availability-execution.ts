import { z } from 'zod';
import { TargetExecutionResultSchema, ReportTargetExecutionInputSchema } from './registration-target-execution.js';

/** Existing marketplace products do not need a common selling product or registration target. */
export const PrepareListingAvailabilityInputSchema = z.object({
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(200),
  kind: z.enum(['sold_out', 'resume']),
  stockoutPolicy: z.literal('capacity_at_or_below_safety_stock').optional(),
  optionCodes: z.array(z.string().trim().min(1).max(200)).max(1000).default([]),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();
export type PrepareListingAvailabilityInput = z.infer<typeof PrepareListingAvailabilityInputSchema>;
export const ListingAvailabilitySnapshotSchema = z.object({
  subject: z.literal('channel_listing'),
  channelListingId: z.string().uuid(), channelAccountId: z.string().uuid(),
  mallKey: z.string().min(1), externalListingId: z.string().min(1),
  kind: z.enum(['sold_out', 'resume']),
  stockoutPolicy: z.literal('capacity_at_or_below_safety_stock').optional(),
  optionCodes: z.array(z.string()),
}).strict();
export type ListingAvailabilitySnapshot = z.infer<typeof ListingAvailabilitySnapshotSchema>;
export const ListingAvailabilityExecutionSchema = TargetExecutionResultSchema.omit({ targetId: true, payload: true }).extend({
  payload: ListingAvailabilitySnapshotSchema,
});
export type ListingAvailabilityExecution = z.infer<typeof ListingAvailabilityExecutionSchema>;
export const ReportListingAvailabilityInputSchema = ReportTargetExecutionInputSchema.extend({
  evidence: ReportTargetExecutionInputSchema.shape.evidence.extend({
    /** Provider reread after sending, scoped to the frozen actual option identities. */
    observedOptionStocks: z.array(z.object({
      externalOptionId: z.string().trim().min(1),
      stock: z.number().int().nonnegative(),
      registrationType: z.literal('NORMAL'),
    }).strict()).optional(),
  }).strict(),
});
export type ReportListingAvailabilityInput = z.infer<typeof ReportListingAvailabilityInputSchema>;
