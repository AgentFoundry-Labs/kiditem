import { Injectable } from '@nestjs/common';
import {
  type AiWingRegistrationCapabilityPort,
  type SubmitWingThumbnailInput,
  type SubmitWingThumbnailResult,
} from '../../../application/port/in/capability/wing-registration.port';
import { ThumbnailWingService } from '../../../application/service/thumbnail-wing.service';

@Injectable()
export class AiWingRegistrationCapabilityAdapter
  implements AiWingRegistrationCapabilityPort
{
  constructor(
    private readonly wing: ThumbnailWingService,
  ) {}

  async submitWingThumbnail(
    input: SubmitWingThumbnailInput,
  ): Promise<SubmitWingThumbnailResult> {
    const result = await this.wing.registerToWing(
      input.generationId,
      input.organizationId,
    );
    if (!result.success) {
      throw new Error(result.error ?? 'Wing upload failed');
    }
    return {
      success: true,
      screenshotPath: result.screenshotPath ?? null,
    };
  }
}
