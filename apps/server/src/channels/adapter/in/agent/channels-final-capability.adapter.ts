import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { ownerTransaction } from "../../../../prisma/owner-transaction";
import {
  canonicalOwnerInputHash,
} from "../../../../common/owner-idempotency-key";
import {
  CHANNEL_REGISTRATION_PORT,
  type ChannelRegistrationPort,
  type ResolveProductRegistrationWithOwnerReceiptInput,
} from "../../../application/port/in/registration/channel-registration.port";
import {
  FROZEN_REGISTRATION_READ_PORT,
  type ServerFrozenRegistration,
  type FrozenRegistrationReadPort,
} from "../../../application/port/in/capability/frozen-registration-read.port";
import type {
  ChannelsConfirmedListingInput,
  ChannelsFinalCapabilityPort,
  ChannelsOwnerExecutionContext,
  ChannelsRegistrationReference,
} from "../../../application/port/in/capability/channels-final-capability.port";

/** Channels owns browser-confirmed ChannelListing mutation. */
@Injectable()
export class ChannelsFinalCapabilityAdapter implements ChannelsFinalCapabilityPort {
  constructor(
    @Inject(CHANNEL_REGISTRATION_PORT)
    private readonly registrations: ChannelRegistrationPort,
    @Inject(FROZEN_REGISTRATION_READ_PORT)
    private readonly provenance: FrozenRegistrationReadPort,
    private readonly prisma: PrismaService,
  ) {}

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
        ownerTransaction(tx),
        receiptResolutionInput({
          context,
          frozen,
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

function receiptResolutionInput(input: {
  context: ChannelsOwnerExecutionContext;
  frozen: ServerFrozenRegistration;
  ownerInput: ChannelsConfirmedListingInput;
  externalListingId: string;
}): ResolveProductRegistrationWithOwnerReceiptInput {
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
    ownerCapabilityKey: "channels.register_confirmed_listing",
    ownerIdempotencyKey: requiredOwnerIdempotencyKey(input.context),
    ownerRequestHash: input.context.ownerInputHash,
  };
}

function registeredResult(preparationId: string, listingId: string) {
  return { preparationId, listingId, status: "registered" as const };
}
