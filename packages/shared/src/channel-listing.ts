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

export type ChannelListingSaleStatusInput = {
  latestSnapshotStatus?: string | null;
  rawStatus?: string | null;
  optionStatuses?: readonly (string | null | undefined)[];
  listingStatus?: string | null;
  isActive: boolean;
};

const ON_SALE_LISTING_STATUSES = new Set([
  'active', 'on_sale', 'sale', 'selling', 'true', '활성', '판매 중', '판매중',
]);

const OFF_SALE_LISTING_STATUSES = new Set([
  'inactive', 'off_sale', 'stopped', 'suspended', 'soldout', 'out_of_stock',
  '비활성', '판매 중지', '판매중지', '품절',
]);

export function isChannelListingOnSale(status: string | null | undefined): boolean {
  return status !== null
    && status !== undefined
    && ON_SALE_LISTING_STATUSES.has(status.trim().toLowerCase());
}

function isRecognizedChannelListingSaleStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return ON_SALE_LISTING_STATUSES.has(normalized)
    || OFF_SALE_LISTING_STATUSES.has(normalized);
}

export function resolveChannelListingSaleStatus(
  input: ChannelListingSaleStatusInput,
): string | null {
  const explicitStatuses = [
    input.latestSnapshotStatus,
    input.rawStatus,
    ...(input.optionStatuses ?? []),
  ];
  for (const status of explicitStatuses) {
    if (typeof status === 'string' && status.trim()) return status.trim();
  }

  if (
    typeof input.listingStatus === 'string'
    && input.listingStatus.trim()
    && isRecognizedChannelListingSaleStatus(input.listingStatus)
  ) {
    return input.listingStatus.trim();
  }

  return input.isActive ? 'active' : null;
}
