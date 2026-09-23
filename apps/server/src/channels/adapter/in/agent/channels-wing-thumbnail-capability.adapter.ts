import { Inject, Injectable } from '@nestjs/common';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import type {
  ChannelsWingThumbnailCapabilityPort,
  WingThumbnailCapabilityResult,
} from '../../../application/port/in/capability/wing-thumbnail.port';
import {
  CHANNELS_THUMBNAIL_EXECUTION_PORT,
  type ChannelsThumbnailExecutionPort,
} from '../../../application/port/in/thumbnail-execution.port';

/** Agent 가 부르는 대표이미지 몰 반영. 실행은 Channels 가 개발 서버 runner 로 하고, 성공은 운영자 확인 뒤다. */
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
  }): Promise<WingThumbnailCapabilityResult> {
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
  }): Promise<WingThumbnailCapabilityResult> {
    const result = await this.executions.runOnServer({
      organizationId: input.organizationId,
      requestedByUserId: input.triggeredByUserId ?? null,
      generationId: input.generationId,
      owner: { ownerIdempotencyKey: input.ownerIdempotencyKey, requestHash: input.requestHash },
    });
    if (result.success) return { success: true, status: 'succeeded', screenshotPath: result.screenshotPath };
    // 올렸고 운영자가 웹에서 Wing 저장을 확인해야 한다. 성공이라고 말하지 않는다.
    if (result.status === 'reconciling') {
      return { success: false, status: 'awaiting_operator_confirmation', screenshotPath: result.screenshotPath };
    }
    throw new Error(result.error ?? 'Wing upload failed');
  }
}
