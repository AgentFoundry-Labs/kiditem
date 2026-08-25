import { describe, expect, it, vi } from 'vitest';
import { AgentOsError } from '../../domain/agent-os.errors';
import { CapabilityApprovalService } from './capability-approval.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const INPUT_HASH = 'a'.repeat(64);

describe('CapabilityApprovalService', () => {
  it('stores an exact approved decision without executing or scheduling the owner', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalStatus: 'pending' })),
      decideApproval: vi.fn().mockResolvedValue(receipt({ approvalStatus: 'approved' })),
    };
    const service = new CapabilityApprovalService(repository as never, () => new Date('2026-08-25T00:00:00.000Z'));

    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
      reason: 'User confirmed the exact mutation.',
    })).resolves.toMatchObject({
      status: 'pending',
      approvalStatus: 'approved',
      inputHash: INPUT_HASH,
    });
    expect(repository.decideApproval).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
      inputHash: INPUT_HASH,
    }));
  });

  it('does not let a browser supply a hash and reports immutable decision conflicts', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalStatus: 'pending' })),
      decideApproval: vi.fn().mockRejectedValue(new AgentOsError('APPROVAL_REJECTED')),
    };
    const service = new CapabilityApprovalService(repository as never);

    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'rejected',
    })).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' } satisfies Partial<AgentOsError>);
    expect(repository.decideApproval).toHaveBeenCalledWith(expect.not.objectContaining({
      approvalInputHash: expect.anything(),
    }));
  });
});

function receipt(input: { approvalStatus: 'approved' | 'rejected' | 'expired' }) {
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: 'channels.submit_coupang_listing',
    actingAgentKey: 'channel_operations',
    requestKey: 'request-1',
    canonicalInput: { preparationId: '00000000-0000-4000-8000-000000000004' },
    inputHash: INPUT_HASH,
    status: input.approvalStatus === 'rejected' || input.approvalStatus === 'expired' ? 'failed' : 'pending',
    approvalStatus: input.approvalStatus,
    approvalInputHash: INPUT_HASH,
    approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
    approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    approvalDecidedByUserId: USER_ID,
    approvalDecisionReason: null,
    approvalDecidedAt: new Date('2026-08-25T00:01:00.000Z'),
    result: null,
    error: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:01:00.000Z'),
    finishedAt: null,
  };
}
