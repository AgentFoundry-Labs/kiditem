import { Prisma, type ProductRegistrationExecution } from '@prisma/client';
import { freezeProductRegistrationPayload, type RegistrationSubmissionJson } from '../../../apps/server/src/channels/domain/registration-submission-payload';

/** Pre-contraction evidence only; runtime drafts no longer store these fields. */
export interface LegacyRegistrationDraft {
  preparationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  channelListingId: string | null;
  submissionKey: string | null;
  submissionPayloadJson: unknown;
  submissionPayloadHash: string | null;
  resolvedProviderOutcome: string;
  providerSubmissionId: string | null;
  hasRegistrationResult: boolean;
  registrationResult: unknown;
  lastError: string | null;
  submissionLeaseToken: string | null;
  submissionLeaseClaimedAt: Date | null;
  approvedByUserId: string | null;
  updatedAt: Date;
}

function assertRegistrationIdentity(draft: LegacyRegistrationDraft): void {
  if (!draft.sourceCandidateId || !draft.channelAccountId) throw new Error('Legacy preparation has no source/account identity.');
}

/**
 * Compatibility fence for preparations created before the execution ledger was
 * introduced. A legacy submission may already have reached provider IO, so it
 * must never be reborn as a fresh create operation.
 */
export async function importLegacyExecution(
  tx: Prisma.TransactionClient,
  draft: LegacyRegistrationDraft,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(draft);
  if (
    !draft.submissionKey
    || !draft.submissionPayloadJson
    || !draft.submissionPayloadHash
  ) {
    throw new Error(
      'Legacy submitting preparation is missing frozen submission data and cannot be safely imported.',
    );
  }
  const frozen = freezeProductRegistrationPayload(
    draft.submissionPayloadJson as RegistrationSubmissionJson,
  );
  if (frozen.hash !== draft.submissionPayloadHash) {
    throw new Error('Legacy frozen submission hash does not match its payload.');
  }
  const legacyOutcome = draft.resolvedProviderOutcome;
  const hasProviderIdentity = draft.providerSubmissionId !== null || draft.hasRegistrationResult;
  const providerOutcome = legacyOutcome === 'succeeded' || hasProviderIdentity
    ? 'succeeded'
    : legacyOutcome === 'definitive_failure'
      ? 'definitive_failure'
      : 'uncertain';
  const status = providerOutcome === 'definitive_failure' ? 'failed' : 'reconciling';
  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: draft.preparationId,
      channelAccountId: draft.channelAccountId,
      idempotencyKey: draft.submissionKey,
      requestHash: frozen.hash,
      submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      status,
      providerOutcome,
      providerSubmissionId: draft.providerSubmissionId,
      externalListingId: legacyExternalListingId(draft.registrationResult),
      resultJson: draft.registrationResult == null
        ? Prisma.JsonNull
        : draft.registrationResult as Prisma.InputJsonValue,
      lastErrorMessage: draft.lastError,
      leaseToken: draft.submissionLeaseToken,
      leaseClaimedAt: draft.submissionLeaseClaimedAt,
      requestedByUserId: draft.approvedByUserId,
      startedAt: draft.submissionLeaseClaimedAt,
    },
  });
}

function legacyExternalListingId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const externalListingId = (value as Record<string, unknown>).externalListingId;
  return typeof externalListingId === 'string' && externalListingId.trim()
    ? externalListingId.trim()
    : null;
}

/** Imports a pre-ledger registered row as a completed replay without provider IO. */
export async function importLegacyRegisteredExecution(
  tx: Prisma.TransactionClient,
  draft: LegacyRegistrationDraft,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(draft);
  if (!draft.channelListingId) {
    throw new Error('Registered preparation is missing its persisted listing identity.');
  }
  const listing = await tx.channelListing.findFirst({
    where: {
      id: draft.channelListingId,
      organizationId,
      channelAccountId: draft.channelAccountId,
      sourceCandidateId: draft.sourceCandidateId,
    },
    select: { id: true, externalId: true },
  });
  if (!listing) {
    throw new Error('Registered preparation listing is outside its persisted account scope.');
  }

  let submissionPayloadJson: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let submissionPayloadHash: string | null = null;
  let requestHash: string;
  if (draft.submissionPayloadJson && draft.submissionPayloadHash) {
    const frozen = freezeProductRegistrationPayload(
      draft.submissionPayloadJson as RegistrationSubmissionJson,
    );
    if (frozen.hash !== draft.submissionPayloadHash) {
      throw new Error('Legacy registered submission hash does not match its payload.');
    }
    submissionPayloadJson = frozen.payload as Prisma.InputJsonValue;
    submissionPayloadHash = frozen.hash;
    requestHash = frozen.hash;
  } else {
    requestHash = freezeProductRegistrationPayload({
      kind: 'legacy_registered_replay',
      preparationId: draft.preparationId,
      channelListingId: listing.id,
      channelAccountId: draft.channelAccountId,
      externalListingId: listing.externalId,
    } as RegistrationSubmissionJson).hash;
  }

  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: draft.preparationId,
      channelAccountId: draft.channelAccountId,
      channelListingId: listing.id,
      idempotencyKey: draft.submissionKey || `legacy-registered:${draft.preparationId}`,
      requestHash,
      submissionPayloadJson,
      submissionPayloadHash,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      providerSubmissionId: draft.providerSubmissionId ?? listing.externalId,
      externalListingId: listing.externalId,
      resultJson: draft.registrationResult == null
        ? Prisma.DbNull
        : draft.registrationResult as Prisma.InputJsonValue,
      requestedByUserId: draft.approvedByUserId,
      completedAt: draft.updatedAt,
    },
  });
}

