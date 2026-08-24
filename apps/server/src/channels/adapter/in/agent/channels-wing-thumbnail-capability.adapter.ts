import { Inject, Injectable } from '@nestjs/common';
import {
  AI_WING_REGISTRATION_CAPABILITY_PORT,
  type AiWingRegistrationCapabilityPort,
} from '../../../../ai/application/port/in/capability/wing-registration.port';
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
    return this.wing.submitWingThumbnail(input);
  }
}
