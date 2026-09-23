import { Inject, Injectable } from '@nestjs/common';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import type { ChannelsWingThumbnailCapabilityPort } from '../../../application/port/in/capability/wing-thumbnail.port';
import {
  CHANNELS_THUMBNAIL_EXECUTION_PORT,
  type ChannelsThumbnailExecutionPort,
} from '../../../application/port/in/thumbnail-execution.port';

/** Agent 가 부르는 대표이미지 몰 반영. 실행은 Channels 가 개발 서버 runner 로 한다. */
@Injectable()
export class ChannelsWingThumbnailCapabilityAdapter
  implements ChannelsWingThumbnailCapabilityPort
{
  constructor(
    @Inject(CHANNELS_THUMBNAIL_EXECUTION_PORT)
    private readonly executions: ChannelsThumbnailExecutionPort,
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
    return this.run(input);
  }

  private async run(input: {
    organizationId: string;
    generationId: string;
    triggeredByUserId?: string | null;
    ownerIdempotencyKey: string;
    requestHash: string;
  }): Promise<{ success: boolean; screenshotPath: string | null }> {
    const result = await this.executions.runOnServer({
      organizationId: input.organizationId,
      requestedByUserId: input.triggeredByUserId ?? null,
      generationId: input.generationId,
      owner: { ownerIdempotencyKey: input.ownerIdempotencyKey, requestHash: input.requestHash },
    });
    if (!result.success) throw new Error(result.error ?? 'Wing upload failed');
    return { success: true, screenshotPath: result.screenshotPath };
  }
}
