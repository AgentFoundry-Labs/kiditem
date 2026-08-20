import { z } from 'zod';

const BoundedCountSchema = z.number().int().nonnegative().max(2_147_483_647);

export const SourcingOperationOutcomeSchema = z.enum([
  'complete',
  'partial',
  'no_change',
]);

export const SourcingOperationResultSchema = z
  .object({
    outcome: SourcingOperationOutcomeSchema,
    summary: z
      .object({
        discovered: BoundedCountSchema,
        accepted: BoundedCountSchema,
        duplicate: BoundedCountSchema,
        unchanged: BoundedCountSchema,
        failed: BoundedCountSchema,
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            source: z.string().trim().min(1).max(120),
            outcome: z.enum([
              'complete',
              'partial',
              'no_change',
              'failed',
              'skipped',
            ]),
            accepted: BoundedCountSchema,
            failed: BoundedCountSchema,
            errorCode: z.string().trim().min(1).max(120).optional(),
          })
          .strict(),
      )
      .max(32),
    snapshotGeneratedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type SourcingOperationOutcome = z.infer<
  typeof SourcingOperationOutcomeSchema
>;
export type SourcingOperationResult = z.infer<
  typeof SourcingOperationResultSchema
>;
