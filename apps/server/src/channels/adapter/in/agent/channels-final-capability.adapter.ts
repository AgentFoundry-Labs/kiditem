import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  canonicalOwnerInputHash,
} from "../../../../common/owner-idempotency-key";
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  DefinitiveMarketplaceRegistrationError,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from "../../../application/port/in/capability/marketplace-registration.port";
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
} from "../../../application/port/out/repository/channel-listing.repository.port";
import {
  SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT,
  type ServerFrozenRegistration,
  type SourcingFrozenRegistrationReadCapabilityPort,
} from "../../../../sourcing/application/port/in/capability/sourcing-frozen-registration-capability.port";
import type {
  ChannelsConfirmedListingInput,
  ChannelsFinalCapabilityPort,
  ChannelsOwnerExecutionContext,
  ChannelsRegistrationReference,
} from "../../../application/port/in/capability/channels-final-capability.port";

/**
 * Channels owns provider submission and ChannelListing mutation. Sourcing is
 * consulted only through its read-only frozen-provenance anti-corruption port.
 */
@Injectable()
export class ChannelsFinalCapabilityAdapter implements ChannelsFinalCapabilityPort {
  constructor(
    @Inject(CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT)
    private readonly registrations: ChannelsMarketplaceRegistrationCapabilityPort,
    @Inject(SOURCING_FROZEN_REGISTRATION_READ_CAPABILITY_PORT)
    private readonly provenance: SourcingFrozenRegistrationReadCapabilityPort,
    private readonly prisma: PrismaService,
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly executions: Pick<
      MarketplaceRegistrationRepositoryPort,
      | "claimProviderWrite"
      | "finalizeProviderWrite"
      | "markProviderWriteUncertain"
      | "markProviderWriteDefinitiveFailure"
    >,
  ) {}

  async submitCoupangListing({
    context,
    input,
  }: {
    context: ChannelsOwnerExecutionContext;
    input: ChannelsRegistrationReference;
  }) {
    assertOwnerReceipt(context, input);
    const frozen = await this.provenance.loadSubmission(
      toFrozenReference(context, input),
    );
    const submission = toSubmissionInput(context, frozen);
    const claim = await this.executions.claimProviderWrite({
      organizationId: context.organizationId,
      executionId: frozen.executionId,
      preparationId: frozen.preparationId,
      channelAccountId: frozen.channelAccountId,
      sourceCandidateId: frozen.sourceCandidateId,
      idempotencyKey: frozen.submissionKey,
      requestHash: frozen.submissionPayloadHash,
      ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
    });
    let providerResult: {
      providerSubmissionId?: string | null;
      externalListingId: string;
    };
    try {
      if (claim.mode === "replay") {
        providerResult = {
          providerSubmissionId: claim.providerSubmissionId,
          externalListingId: claim.externalListingId,
        };
      } else {
        const reconciled =
          await this.registrations.reconcileProductRegistration({
            ...submission,
            isRetry: true,
            // Only the Channels-owned provider claim may authorize create.
            providerCreateAllowed: false,
          });
        if (reconciled) {
          providerResult = reconciled;
        } else if (claim.mode === "reconcile") {
          throw new Error("provider_reconciliation_pending");
        } else {
          providerResult = await this.registrations.submitProductRegistration(
            {
              ...submission,
              isRetry: false,
              providerCreateAllowed: true,
            },
            async () => undefined,
          );
        }
        if (!claim.leaseToken) {
          throw new Error("provider_reconciliation_pending");
        }
        await this.executions.finalizeProviderWrite({
          organizationId: context.organizationId,
          executionId: frozen.executionId,
          leaseToken: claim.leaseToken,
          providerSubmissionId: providerResult.providerSubmissionId ?? null,
          externalListingId: providerResult.externalListingId,
          result: providerResult,
        });
      }
    } catch (error) {
      if (claim.mode !== "replay" && claim.leaseToken) {
        const failure = {
          organizationId: context.organizationId,
          executionId: frozen.executionId,
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
      this.registrations.resolveProductRegistrationWithOwnerReceipt(
        tx,
        receiptResolutionInput({
          context,
          frozen,
          capabilityKey: "channels.submit_coupang_listing",
          ownerInput: input,
          externalListingId: providerResult.externalListingId,
        }),
      ),
    );
    return registeredResult(frozen.preparationId, listing.listingId);
  }

  async registerConfirmedListing({
    context,
    input,
  }: {
    context: ChannelsOwnerExecutionContext;
    input: ChannelsConfirmedListingInput;
  }) {
    assertOwnerReceipt(context, input);
    const frozen = await this.provenance.loadExternalConfirmation(
      toFrozenReference(context, input),
    );
    const account =
      await this.registrations.assertExternalProductRegistrationAccount({
        organizationId: context.organizationId,
        channelAccountId: frozen.channelAccountId,
      });
    if (
      frozen.expectedProviderAccountId !== account.vendorId ||
      input.confirmationEvidence.wingVendorId !== account.vendorId
    ) {
      throw new Error("frozen_submission_mismatch:provider_account");
    }
    const listing = await this.prisma.$transaction((tx) =>
      this.registrations.resolveProductRegistrationWithOwnerReceipt(
        tx,
        receiptResolutionInput({
          context,
          frozen,
          capabilityKey: "channels.register_confirmed_listing",
          ownerInput: input,
          externalListingId: input.externalListingId,
        }),
      ),
    );
    return registeredResult(frozen.preparationId, listing.listingId);
  }
}

function requiredOwnerIdempotencyKey(
  context: ChannelsOwnerExecutionContext,
): string {
  if (!/^capability-invocation:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.ownerIdempotencyKey)) {
    throw new Error("owner_idempotency_key_required");
  }
  return context.ownerIdempotencyKey;
}

function assertOwnerReceipt(
  context: ChannelsOwnerExecutionContext,
  input: ChannelsRegistrationReference | ChannelsConfirmedListingInput,
): void {
  requiredOwnerIdempotencyKey(context);
  if (context.ownerInputHash !== canonicalOwnerInputHash(input)) {
    throw new Error("owner_idempotency_key_conflict");
  }
}

function toFrozenReference(
  context: ChannelsOwnerExecutionContext,
  input: ChannelsRegistrationReference,
) {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: input.registrationExecutionId,
    preparationId: input.preparationId,
  };
}

function toSubmissionInput(
  context: ChannelsOwnerExecutionContext,
  frozen: ServerFrozenRegistration,
) {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: frozen.executionId,
    preparationId: frozen.preparationId,
    sourceCandidateId: frozen.sourceCandidateId,
    channelAccountId: frozen.channelAccountId,
    submissionKey: frozen.submissionKey,
    submissionPayloadHash: frozen.submissionPayloadHash,
    submissionPayloadJson: frozen.submissionPayloadJson,
    providerSubmissionId: frozen.providerSubmissionId,
    registrationResult: frozen.registrationResult,
    ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
    isRetry: frozen.isRetry,
    providerOutcome: frozen.providerOutcome,
  };
}

function receiptResolutionInput(input: {
  context: ChannelsOwnerExecutionContext;
  frozen: ServerFrozenRegistration;
  capabilityKey:
    "channels.submit_coupang_listing" | "channels.register_confirmed_listing";
  ownerInput: ChannelsRegistrationReference | ChannelsConfirmedListingInput;
  externalListingId: string;
}) {
  return {
    organizationId: input.context.organizationId,
    sourceCandidateId: input.frozen.sourceCandidateId,
    channelAccountId: input.frozen.channelAccountId,
    submissionKey: input.frozen.submissionKey,
    externalListingId: input.externalListingId,
    displayName: input.frozen.displayName,
    ...(input.frozen.masterProductId
      ? { masterProductId: input.frozen.masterProductId }
      : {}),
    optionLinks: input.frozen.optionLinks,
    ownerCapabilityKey: input.capabilityKey,
    ownerIdempotencyKey: requiredOwnerIdempotencyKey(input.context),
    ownerRequestHash: input.context.ownerInputHash,
  };
}

function registeredResult(preparationId: string, listingId: string) {
  return { preparationId, listingId, status: "registered" as const };
}
