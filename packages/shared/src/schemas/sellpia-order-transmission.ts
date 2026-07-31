import { z } from 'zod';

const IsoDateTimeStringSchema = z.string().datetime({ offset: true });

export const SellpiaOrderTransmissionIntentKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(500);

export const SellpiaOrderTransmissionIntentPrepareRequestSchema = z
  .object({ intentKey: SellpiaOrderTransmissionIntentKeySchema })
  .strict();

export const SellpiaOrderTransmissionIntentPrepareResponseSchema = z
  .object({
    intentKey: SellpiaOrderTransmissionIntentKeySchema,
    disposition: z.enum(['prepared', 'already_prepared', 'already_finalized']),
  })
  .strict();

export const SellpiaOrderTransmissionIntentFinalizeResponseSchema = z
  .object({
    intentKey: SellpiaOrderTransmissionIntentKeySchema,
    status: z.literal('finalized'),
  })
  .strict();

export const SellpiaOrderTransmissionIntentAbortResponseSchema = z
  .object({
    intentKey: SellpiaOrderTransmissionIntentKeySchema,
    status: z.literal('aborted'),
  })
  .strict();

export const SellpiaOrderTransmissionIntentReconcileRequestSchema = z
  .object({
    intentKey: SellpiaOrderTransmissionIntentKeySchema,
    outcome: z.enum(['submitted', 'not_submitted']),
    note: z.string().trim().min(1).max(500),
  })
  .strict();

export const SellpiaOrderTransmissionIntentReconcileResponseSchema = z
  .object({
    intentKey: SellpiaOrderTransmissionIntentKeySchema,
    outcome: z.enum(['submitted', 'not_submitted']),
    status: z.enum(['finalized', 'aborted']),
    reconciledBy: z.string().uuid(),
    reconciledAt: IsoDateTimeStringSchema,
    note: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedStatus = value.outcome === 'submitted' ? 'finalized' : 'aborted';
    if (value.status !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        message: `Outcome ${value.outcome} requires status ${expectedStatus}`,
        path: ['status'],
      });
    }
  });

export type SellpiaOrderTransmissionIntentPrepareRequest = z.infer<
  typeof SellpiaOrderTransmissionIntentPrepareRequestSchema
>;
export type SellpiaOrderTransmissionIntentPrepareResponse = z.infer<
  typeof SellpiaOrderTransmissionIntentPrepareResponseSchema
>;
export type SellpiaOrderTransmissionIntentFinalizeResponse = z.infer<
  typeof SellpiaOrderTransmissionIntentFinalizeResponseSchema
>;
export type SellpiaOrderTransmissionIntentAbortResponse = z.infer<
  typeof SellpiaOrderTransmissionIntentAbortResponseSchema
>;
export type SellpiaOrderTransmissionIntentReconcileRequest = z.infer<
  typeof SellpiaOrderTransmissionIntentReconcileRequestSchema
>;
export type SellpiaOrderTransmissionIntentReconcileResponse = z.infer<
  typeof SellpiaOrderTransmissionIntentReconcileResponseSchema
>;
