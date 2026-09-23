import { Inject, Injectable } from '@nestjs/common';
import { REGISTRATION_EXECUTION_PORT, type RegistrationExecutionPort } from '../../../application/port/in/capability/registration-execution.port';
import {
  defineCapabilityComposition,
  type CapabilityExecutionContext,
} from '../../../../common/capability-composition';
import { CHANNELS_CAPABILITIES } from '../../../domain/capability/channels.capabilities';
import {
  CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT,
  type ChannelsRepresentativeImageCapabilityPort,
} from '../../../application/port/in/capability/representative-image.port';
import type { ChannelsCapabilityCompositionPort } from '../../../application/port/in/capability/channels-capability-composition.port';

/** Channels owns the definition-to-marketplace-owner-port Adapters. */
@Injectable()
export class ChannelsCapabilityCompositionAdapter
  implements ChannelsCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT)
    private readonly representativeImages: ChannelsRepresentativeImageCapabilityPort,
    @Inject(REGISTRATION_EXECUTION_PORT)
    private readonly executions: RegistrationExecutionPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(CHANNELS_CAPABILITIES[0], this.representativeImages, {
        capabilityKey: 'channels.submit_representative_image',
        ownerInputPort: 'channels.submitRepresentativeImage',
        invoke: ({ context, input }) =>
          this.representativeImages.submitRepresentativeImage({
            organizationId: context.organizationId,
            generationId: input.generationId,
            triggeredByUserId: context.initiatingUserId,
            ownerIdempotencyKey: requiredOwnerIdempotencyKey(context),
            requestHash: requiredOwnerInputHash(context),
          }),
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[1], this.executions, {
        capabilityKey: 'channels.prepare_target_execution', ownerInputPort: 'channels.prepareTargetExecution',
        invoke: ({ context, input: { targetId, ...input } }) => this.executions.prepareTargetExecution(
          context.organizationId, targetId, context.initiatingUserId,
          { ...input, idempotencyKey: requiredOwnerIdempotencyKey(context) }),
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[2], this.executions, {
        capabilityKey: 'channels.get_target_execution', ownerInputPort: 'channels.getTargetExecution',
        invoke: ({ context, input }) => this.executions.getTargetExecution(context.organizationId, input.executionId, context.initiatingUserId),
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[3], this.executions, {
        capabilityKey: 'channels.start_target_execution', ownerInputPort: 'channels.startTargetExecution',
        invoke: ({ context, input }) => this.executions.startTargetExecution(context.organizationId, input.executionId, context.initiatingUserId),
      }),
      defineCapabilityComposition(CHANNELS_CAPABILITIES[4], this.executions, {
        capabilityKey: 'channels.report_target_execution', ownerInputPort: 'channels.reportTargetExecution',
        invoke: ({ context, input: { executionId, ...report } }) => this.executions.reportTargetExecution(context.organizationId, executionId, context.initiatingUserId, report),
      }),
    ];
  }
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
