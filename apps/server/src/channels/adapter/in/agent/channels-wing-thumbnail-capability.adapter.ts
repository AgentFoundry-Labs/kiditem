import { Inject, Injectable } from '@nestjs/common';
import {
  AI_WING_REGISTRATION_CAPABILITY_PORT,
  type AiWingRegistrationCapabilityPort,
} from '../../../../ai/application/port/in/capability/wing-registration.port';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import type { ChannelsWingThumbnailCapabilityPort } from '../../../application/port/in/capability/wing-thumbnail.port';

/** Channels owns marketplace submission; AI remains the media-generation provider. */
@Injectable()
export class ChannelsWingThumbnailCapabilityAdapter
  implements ChannelsWingThumbnailCapabilityPort
{
  constructor(
    @Inject(AI_WING_REGISTRATION_CAPABILITY_PORT)
    private readonly wing: AiWingRegistrationCapabilityPort,
  ) {}

  submitWingThumbnail(input: {
    organizationId: string;
    generationId: string;
    triggeredByUserId?: string | null;
    ownerIdempotencyKey: string;
    requestHash: string;
  }): Promise<{ success: boolean; screenshotPath: string | null }> {
    if (
      !/^capability-invocation:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.ownerIdempotencyKey)
      || input.requestHash !== canonicalOwnerInputHash({ generationId: input.generationId })
    ) {
      throw new Error('owner_idempotency_key_conflict');
    }
    return this.wing.submitWingThumbnail(input);
  }
}
