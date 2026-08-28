import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { ChannelsWingThumbnailCapabilityAdapter } from './channels-wing-thumbnail-capability.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const generationId = 'generation-1';

describe('ChannelsWingThumbnailCapabilityAdapter', () => {
  it('delegates the exact admitted owner key and canonical hash to the AI owner', async () => {
    const wing = {
      submitWingThumbnail: vi.fn().mockResolvedValue({
        success: true,
        screenshotPath: null,
      }),
    };
    const adapter = new ChannelsWingThumbnailCapabilityAdapter(wing as never);
    const input = {
      organizationId: ORGANIZATION_ID,
      generationId,
      triggeredByUserId: USER_ID,
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    };

    await expect(adapter.submitWingThumbnail(input)).resolves.toEqual({
      success: true,
      screenshotPath: null,
    });
    expect(wing.submitWingThumbnail).toHaveBeenCalledWith(input);
  });

  it('rejects a forged key or hash before the AI owner is called', async () => {
    const wing = { submitWingThumbnail: vi.fn() };
    const adapter = new ChannelsWingThumbnailCapabilityAdapter(wing as never);
    const input = {
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: 'caller-controlled-key',
      requestHash: canonicalOwnerInputHash({ generationId: 'other-generation' }),
    };

    expect(() => adapter.submitWingThumbnail(input)).toThrow(
      'owner_idempotency_key_conflict',
    );
    expect(wing.submitWingThumbnail).not.toHaveBeenCalled();
  });
});
