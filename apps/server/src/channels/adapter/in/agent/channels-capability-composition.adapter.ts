import { Inject, Injectable } from '@nestjs/common';
import {
  defineCapabilityComposition,
  type CapabilityExecutionContext,
} from '../../../../common/capability-composition';
import { CHANNELS_CAPABILITIES } from '../../../domain/capability/channels.capabilities';
import {
  CHANNELS_FINAL_CAPABILITY_PORT,
  type ChannelsFinalCapabilityPort,
  type ChannelsOwnerExecutionContext,
} from '../../../application/port/in/capability/channels-final-capability.port';
import {
  CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT,
  type ChannelsWingThumbnailCapabilityPort,
} from '../../../application/port/in/capability/wing-thumbnail.port';
import type { ChannelsCapabilityCompositionPort } from '../../../application/port/in/capability/channels-capability-composition.port';

/** Channels owns the definition-to-marketplace-owner-port Adapters. */
@Injectable()
export class ChannelsCapabilityCompositionAdapter
  implements ChannelsCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(CHANNELS_FINAL_CAPABILITY_PORT)
    private readonly finalListings: ChannelsFinalCapabilityPort,
    @Inject(CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT)
    private readonly wingThumbnails: ChannelsWingThumbnailCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(CHANNELS_CAPABILITIES[0], this.finalListings, {
        capabilityKey: 'channels.register_confirmed_listing',
        ownerInputPort: 'channels.registerConfirmedListing',
        invoke: ({ context, input }) =>
          this.finalListings.registerConfirmedListing({
            context: channelsMutationContext(context),
            input,
          }),
        resourceRef: (output) =>
          output.listingId
            ? { kind: 'channel_listing', id: output.listingId }
            : null,
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[1], this.finalListings, {
        capabilityKey: 'channels.submit_coupang_listing',
        ownerInputPort: 'channels.submitCoupangListing',
        invoke: ({ context, input }) =>
          this.finalListings.submitCoupangListing({
            context: channelsMutationContext(context),
            input,
          }),
        resourceRef: (output) =>
          output.listingId
            ? { kind: 'channel_listing', id: output.listingId }
            : null,
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[2], this.wingThumbnails, {
        capabilityKey: 'channels.submit_wing_thumbnail',
        ownerInputPort: 'channels.submitWingThumbnail',
        invoke: ({ context, input }) =>
          this.wingThumbnails.submitWingThumbnail({
            organizationId: context.organizationId,
            generationId: input.generationId,
            triggeredByUserId: context.initiatingUserId,
            ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
            requestHash: requiredOwnerInputHash(context),
          }),
      }),
    ];
  }
}

function channelsMutationContext(
  context: CapabilityExecutionContext,
): ChannelsOwnerExecutionContext {
  return {
    organizationId: context.organizationId,
    initiatingUserId: context.initiatingUserId,
    executionId: context.executionId,
    ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
    ownerInputHash: requiredOwnerInputHash(context),
  };
}

function requiredOwnerInputHash(
  context: CapabilityExecutionContext,
): string {
  if (!context.ownerInputHash?.match(/^[a-f0-9]{64}$/)) {
    throw new Error('owner_input_hash_required');
  }
  return context.ownerInputHash;
}

function requiredOwnerIdempotencyKey(
  context: CapabilityExecutionContext,
): string {
  if (!context.ownerIdempotencyKey?.trim()) {
    throw new Error('owner_idempotency_key_required');
  }
  return context.ownerIdempotencyKey;
}
