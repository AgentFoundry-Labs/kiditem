import { z } from 'zod';
export {
  SOURCE_READINESS_LABELS,
  deriveSourceReadiness,
  sourceReadinessStatus,
} from './source-readiness-runtime.js';
export type {
  SourceAttemptState,
  SourceReadinessDerivation,
  SourceReadinessDerivationInput,
  SourceReadinessStatus,
} from './source-readiness-runtime.js';

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

export const SourceAttemptStateSchema = z.enum(['RUNNING', 'COMPLETE', 'FAILED']);

export const SourceReadinessStatusSchema = z.enum(['ready', 'stale', 'missing']);

export const SourceReadinessAttemptSchema = z.object({
  state: SourceAttemptStateSchema,
}).passthrough();
export type SourceReadinessAttempt = z.infer<typeof SourceReadinessAttemptSchema>;

export const SourceReadinessCompleteSchema = z.object({
  actualCutoff: CalendarDateSchema.nullable(),
}).passthrough();
export type SourceReadinessComplete = z.infer<typeof SourceReadinessCompleteSchema>;

export const SourceReadinessSchema = z.object({
  ready: z.boolean(),
  requiredCutoff: CalendarDateSchema,
  actualCutoff: CalendarDateSchema.nullable(),
  latestAttempt: SourceReadinessAttemptSchema.nullable(),
  latestComplete: SourceReadinessCompleteSchema.nullable(),
}).strict();
export type SourceReadiness = z.infer<typeof SourceReadinessSchema>;
