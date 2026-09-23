import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { ChannelsWingThumbnailCapabilityAdapter } from './channels-wing-thumbnail-capability.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const generationId = '00000000-0000-4000-8000-000000000004';
const executionId = '00000000-0000-4000-8000-000000000005';

describe('ChannelsWingThumbnailCapabilityAdapter', () => {
  it('runs the Channels thumbnail execution on the server with the admitted owner key and canonical hash', async () => {
    const executions = {
      runOnServer: vi.fn().mockResolvedValue({ generationId, executionId, success: true, screenshotPath: '/tmp/shot.png' }),
    };
    const adapter = new ChannelsWingThumbnailCapabilityAdapter(executions as never);
    const owner = {
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    };

    await expect(adapter.submitWingThumbnail({ organizationId: ORGANIZATION_ID, generationId, triggeredByUserId: USER_ID, ...owner }))
      .resolves.toEqual({ success: true, screenshotPath: '/tmp/shot.png' });
    expect(executions.runOnServer).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      generationId,
      owner,
    });
  });

  it('fails the invocation when the mall refused the image', async () => {
    const executions = {
      runOnServer: vi.fn().mockResolvedValue({ generationId, executionId, success: false, screenshotPath: null, error: '상품을 찾을 수 없습니다' }),
    };
    const adapter = new ChannelsWingThumbnailCapabilityAdapter(executions as never);
    await expect(adapter.submitWingThumbnail({
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    })).rejects.toThrow('상품을 찾을 수 없습니다');
  });

  it('rejects a forged key or hash before the execution owner is called', () => {
    const executions = { runOnServer: vi.fn() };
    const adapter = new ChannelsWingThumbnailCapabilityAdapter(executions as never);
    expect(() => adapter.submitWingThumbnail({
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: 'caller-controlled-key',
      requestHash: canonicalOwnerInputHash({ generationId: 'other-generation' }),
    })).toThrow('owner_idempotency_key_conflict');
    expect(executions.runOnServer).not.toHaveBeenCalled();
  });
});
