import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  DefinitiveMarketplaceRegistrationError,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../../../application/port/in/capability/marketplace-registration.port';
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
} from '../../../application/port/out/repository/channel-listing.repository.port';
import { deriveOwnerIdempotencyKey } from '../../../../common/owner-idempotency-key';
import {
  SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT,
  type SourcingFrozenRegistrationReadCapabilityPort,
} from '../../../../sourcing/application/port/in/capability/sourcing-frozen-registration-capability.port';
import type {
  ChannelsFinalCapabilityPort,
  ChannelsFrozenConfirmationInput,
  ChannelsFrozenSubmissionInput,
  ChannelsOwnerExecutionContext,
} from '../../../application/port/in/capability/channels-final-capability.port';

/**
 * Channels owns provider submission and ChannelListing mutation. Sourcing is
 * consulted only through the read-only frozen-provenance anti-corruption port.
 */
@Injectable()
export class ChannelsFinalCapabilityAdapter
  implements ChannelsFinalCapabilityPort
{
  constructor(
    @Inject(CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT)
    private readonly registrations: ChannelsMarketplaceRegistrationCapabilityPort,
    @Inject(SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT)
    private readonly provenance: SourcingFrozenRegistrationReadCapabilityPort,
    private readonly prisma: PrismaService,
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly executions: Pick<
      MarketplaceRegistrationRepositoryPort,
      'claimProviderWrite' | 'finalizeProviderWrite' | 'markProviderWriteUncertain' | 'markProviderWriteDefinitiveFailure'
    >,
  ) {}

  async submitCoupangListing({ context, input }: { context: ChannelsOwnerExecutionContext; input: ChannelsFrozenSubmissionInput }) {
    const frozen = await this.provenance.validateSubmission(toSourcingSubmission(context, input));
    const submission = toSubmissionInput(context, input);
    assertSubmissionOwnerKey(context, input);
    const claim = await this.executions.claimProviderWrite({
      organizationId: context.organizationId,
      executionId: input.executionId,
      preparationId: input.preparationId,
      channelAccountId: input.channelAccountId,
      sourceCandidateId: input.sourceCandidateId,
      idempotencyKey: input.submissionKey,
      requestHash: input.submissionPayloadHash,
      ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
    });
    let providerResult: { providerSubmissionId?: string | null; externalListingId: string };
    try {
      if (claim.mode === 'replay') {
        providerResult = {
          providerSubmissionId: claim.providerSubmissionId,
          externalListingId: claim.externalListingId,
        };
      } else {
        const reconciled = await this.registrations.reconcileProductRegistration({
          ...submission,
          // Agent-provided outcome flags are advisory only. The Channels-owned
          // execution fence is the sole authority for provider IO.
          isRetry: true,
          providerCreateAllowed: false,
        });
        if (reconciled) {
          providerResult = reconciled;
        } else if (claim.mode === 'reconcile') {
          throw new Error('provider_reconciliation_pending');
        } else {
          providerResult = await this.registrations.submitProductRegistration({
            ...submission,
            isRetry: false,
            providerCreateAllowed: true,
          }, async () => undefined);
        }
        if (!claim.leaseToken) {
          throw new Error('provider_reconciliation_pending');
        }
        await this.executions.finalizeProviderWrite({
          organizationId: context.organizationId,
          executionId: input.executionId,
          leaseToken: claim.leaseToken,
          providerSubmissionId: providerResult.providerSubmissionId ?? null,
          externalListingId: providerResult.externalListingId,
          result: providerResult,
        });
      }
    } catch (error) {
      if (claim.mode !== 'replay' && claim.leaseToken) {
        const failure = {
          organizationId: context.organizationId,
          executionId: input.executionId,
          leaseToken: claim.leaseToken,
          message: error instanceof Error ? error.message : String(error),
        };
        if (error instanceof DefinitiveMarketplaceRegistrationError) {
          await this.executions.markProviderWriteDefinitiveFailure(failure);
        } else {
          await this.executions.markProviderWriteUncertain(failure);
        }
      }
      throw error;
    }
    const listing = await this.prisma.$transaction((tx) =>
      this.registrations.resolveProductRegistration(tx, {
        ...submission,
        externalListingId: providerResult.externalListingId,
        displayName: frozen.displayName,
        ...(input.masterProductId ? { masterProductId: input.masterProductId } : {}),
        optionLinks: input.optionLinks,
      }));
    return {
      preparationId: input.preparationId,
      listingId: listing.listingId,
      status: 'registered' as const,
    };
  }

  async registerConfirmedListing({ context, input }: { context: ChannelsOwnerExecutionContext; input: ChannelsFrozenConfirmationInput }) {
    const frozen = await this.provenance.validateExternalConfirmation(toSourcingConfirmation(context, input));
    const account = await this.registrations.assertExternalProductRegistrationAccount({
      organizationId: context.organizationId,
      channelAccountId: input.channelAccountId,
    });
    if (frozen.expectedProviderAccountId !== account.vendorId
      || input.confirmationEvidence.wingVendorId !== account.vendorId) {
      throw new Error('frozen_submission_mismatch:provider_account');
    }
    const submission = toSubmissionInput(context, input);
    const listing = await this.prisma.$transaction((tx) =>
      this.registrations.resolveProductRegistration(tx, {
        ...submission,
        externalListingId: input.externalListingId,
        displayName: input.displayName,
        ...(input.masterProductId ? { masterProductId: input.masterProductId } : {}),
        optionLinks: input.optionLinks,
      }));
    return {
      preparationId: input.preparationId,
      listingId: listing.listingId,
      status: 'registered' as const,
    };
  }
}

function requiredOwnerIdempotencyKey(context: ChannelsOwnerExecutionContext): string {
  if (!context.ownerIdempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
  return context.ownerIdempotencyKey;
}

function assertSubmissionOwnerKey(
  context: ChannelsOwnerExecutionContext,
  input: ChannelsFrozenSubmissionInput,
): void {
  const expected = deriveOwnerIdempotencyKey({
    attemptId: context.attemptId,
    capabilityKey: 'channels.submit_coupang_listing',
    input,
  });
  if (requiredOwnerIdempotencyKey(context) !== expected) {
    throw new Error('owner_idempotency_key_conflict');
  }
}

function toSubmissionInput(context: ChannelsOwnerExecutionContext, input: ChannelsFrozenSubmissionInput) {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: input.executionId,
    preparationId: input.preparationId,
    sourceCandidateId: input.sourceCandidateId,
    channelAccountId: input.channelAccountId,
    submissionKey: input.submissionKey,
    submissionPayloadHash: input.submissionPayloadHash,
    submissionPayloadJson: input.submissionPayloadJson,
    providerSubmissionId: input.providerSubmissionId,
    registrationResult: input.registrationResult,
    ownerIdempotencyKey: context.ownerIdempotencyKey,
    ...(input.isRetry !== undefined ? { isRetry: input.isRetry } : {}),
    ...(input.providerOutcome ? { providerOutcome: input.providerOutcome } : {}),
    ...(input.providerCreateAllowed !== undefined
      ? { providerCreateAllowed: input.providerCreateAllowed }
      : {}),
  };
}

function toSourcingSubmission(context: ChannelsOwnerExecutionContext, input: ChannelsFrozenSubmissionInput) {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: input.executionId,
    preparationId: input.preparationId,
    sourceCandidateId: input.sourceCandidateId,
    channelAccountId: input.channelAccountId,
    submissionKey: input.submissionKey,
    submissionPayloadHash: input.submissionPayloadHash,
    submissionPayloadJson: input.submissionPayloadJson,
    providerSubmissionId: input.providerSubmissionId,
    registrationResult: input.registrationResult,
    isRetry: input.isRetry,
    providerOutcome: input.providerOutcome,
    providerCreateAllowed: input.providerCreateAllowed,
    ...(input.masterProductId ? { masterProductId: input.masterProductId } : {}),
    optionLinks: input.optionLinks,
  };
}

function toSourcingConfirmation(context: ChannelsOwnerExecutionContext, input: ChannelsFrozenConfirmationInput) {
  return {
    ...toSourcingSubmission(context, input),
    externalListingId: input.externalListingId,
    displayName: input.displayName,
    confirmationEvidence: input.confirmationEvidence,
  };
}
