import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../../../application/port/in/capability/marketplace-registration.port';
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
  ) {}

  async submitCoupangListing({ context, input }: { context: ChannelsOwnerExecutionContext; input: ChannelsFrozenSubmissionInput }) {
    const frozen = await this.provenance.validateSubmission(toSourcingSubmission(context, input));
    const submission = toSubmissionInput(context, input);
    const reconciled = await this.registrations.reconcileProductRegistration(submission);
    const providerResult = reconciled ?? await this.registrations.submitProductRegistration(
      submission,
      async () => undefined,
    );
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
