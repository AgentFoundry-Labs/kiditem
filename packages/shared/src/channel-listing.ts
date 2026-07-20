import { z } from 'zod';
import {
  canRetryProviderSideEffect,
  OperationStatusSchema,
  ProviderOutcomeSchema,
} from './operation-lifecycle.js';
import { zIsoDate } from './schemas/common.js';

export {
  OPERATION_STATUSES,
  PROVIDER_OUTCOMES,
  OperationStatusSchema,
  ProviderOutcomeSchema,
  canRetryProviderSideEffect,
  isOperationTerminal,
} from './operation-lifecycle.js';
export type { OperationStatus, ProviderOutcome } from './operation-lifecycle.js';

export const MarketplaceSubmissionResultSchema = z.object({
  providerSubmissionId: z.string().trim().min(1).nullable().optional(),
  externalListingId: z.string().trim().min(1),
  channel: z.string().trim().min(1),
  rawResult: z.unknown(),
}).strict();

export const ChannelListingRegistrationResultSchema = z.object({
  listingId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channel: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  status: z.string().nullable().optional(),
}).strict();

export const ChannelListingDeletionOperationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channelListingId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1),
  requestHash: z.string().trim().min(1),
  externalListingId: z.string().trim().min(1),
  expectedProviderAccountId: z.string().trim().min(1),
  status: OperationStatusSchema,
  providerOutcome: ProviderOutcomeSchema,
  resultJson: z.unknown().nullable(),
  lastErrorCode: z.string().trim().min(1).nullable(),
  lastErrorMessage: z.string().trim().min(1).nullable(),
  leaseToken: z.string().uuid().nullable(),
  leaseClaimedAt: zIsoDate.nullable(),
  requestedByUserId: z.string().uuid().nullable(),
  authorizationExpiresAt: zIsoDate.nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict();

export type MarketplaceSubmissionResult = z.infer<typeof MarketplaceSubmissionResultSchema>;
export type ChannelListingRegistrationResult = z.infer<
  typeof ChannelListingRegistrationResultSchema
>;
export type ChannelListingDeletionOperation = z.infer<
  typeof ChannelListingDeletionOperationSchema
>;

export function canRetryChannelListingDeletionProviderSideEffect(
  status: z.infer<typeof OperationStatusSchema>,
  providerOutcome: z.infer<typeof ProviderOutcomeSchema>,
): boolean {
  return canRetryProviderSideEffect(status, providerOutcome);
}
