import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { ChannelsRepresentativeImageCapabilityAdapter } from './channels-representative-image-capability.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const generationId = '00000000-0000-4000-8000-000000000004';
const executionId = '00000000-0000-4000-8000-000000000005';

describe('ChannelsRepresentativeImageCapabilityAdapter', () => {
  it('answers an upload with a pending receipt: the operator confirms the mall save in the web app', async () => {
    const executions = {
      runOnServer: vi.fn().mockResolvedValue({
        generationId, executionId, success: false, status: 'reconciling', screenshotPath: '/tmp/shot.png', error: 'Wing 수정 화면에 올렸습니다',
      }),
    };
    const adapter = new ChannelsRepresentativeImageCapabilityAdapter(executions as never);
    await expect(adapter.submitRepresentativeImage({
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    })).resolves.toEqual({ success: false, status: 'awaiting_operator_confirmation', screenshotPath: '/tmp/shot.png' });
  });

  it('runs the Channels thumbnail execution on the server with the admitted owner key and canonical hash', async () => {
    const executions = {
      runOnServer: vi.fn().mockResolvedValue({ generationId, executionId, success: true, status: 'succeeded', screenshotPath: '/tmp/shot.png' }),
    };
    const adapter = new ChannelsRepresentativeImageCapabilityAdapter(executions as never);
    const owner = {
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    };

    await expect(adapter.submitRepresentativeImage({ organizationId: ORGANIZATION_ID, generationId, triggeredByUserId: USER_ID, ...owner }))
      .resolves.toEqual({ success: true, status: 'succeeded', screenshotPath: '/tmp/shot.png' });
    expect(executions.runOnServer).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      generationId,
      owner,
    });
  });

  it('fails the invocation when the mall refused the image', async () => {
    const executions = {
      runOnServer: vi.fn().mockResolvedValue({ generationId, executionId, success: false, status: 'failed', screenshotPath: null, error: '상품을 찾을 수 없습니다' }),
    };
    const adapter = new ChannelsRepresentativeImageCapabilityAdapter(executions as never);
    await expect(adapter.submitRepresentativeImage({
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      requestHash: canonicalOwnerInputHash({ generationId }),
    })).rejects.toThrow('상품을 찾을 수 없습니다');
  });

  it('rejects a forged key or hash before the execution owner is called', () => {
    const executions = { runOnServer: vi.fn() };
    const adapter = new ChannelsRepresentativeImageCapabilityAdapter(executions as never);
    expect(() => adapter.submitRepresentativeImage({
      organizationId: ORGANIZATION_ID,
      generationId,
      ownerIdempotencyKey: 'caller-controlled-key',
      requestHash: canonicalOwnerInputHash({ generationId: 'other-generation' }),
    })).toThrow('owner_idempotency_key_conflict');
    expect(executions.runOnServer).not.toHaveBeenCalled();
  });
});
