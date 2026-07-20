import { z } from 'zod';
import {
  canRetryProviderSideEffect,
  OperationStatusSchema,
  ProviderOutcomeSchema,
} from '../operation-lifecycle.js';
import { zIsoDate } from '../schemas/common.js';

export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from '../operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from '../operation-lifecycle.js';

export const ProductRegistrationExecutionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  productPreparationId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channelListingId: z.string().uuid().nullable(),
  executionKind: z.enum(['create', 'external_wing']),
  expectedProviderAccountId: z.string().trim().min(1).max(80).nullable(),
  idempotencyKey: z.string().trim().min(1),
  requestHash: z.string().trim().min(1),
  submissionPayloadJson: z.unknown().nullable(),
  submissionPayloadHash: z.string().trim().min(1).nullable(),
  status: OperationStatusSchema,
  providerOutcome: ProviderOutcomeSchema,
  providerSubmissionId: z.string().trim().min(1).nullable(),
  externalListingId: z.string().trim().min(1).nullable(),
  resultJson: z.unknown().nullable(),
  lastErrorCode: z.string().trim().min(1).nullable(),
  lastErrorMessage: z.string().trim().min(1).nullable(),
  leaseToken: z.string().uuid().nullable(),
  leaseClaimedAt: zIsoDate.nullable(),
  requestedByUserId: z.string().uuid().nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict();

export type ProductRegistrationExecution = z.infer<typeof ProductRegistrationExecutionSchema>;

export function canRetryProductRegistrationExecutionProviderSideEffect(
  status: z.infer<typeof OperationStatusSchema>,
  providerOutcome: z.infer<typeof ProviderOutcomeSchema>,
): boolean {
  return canRetryProviderSideEffect(status, providerOutcome);
}
