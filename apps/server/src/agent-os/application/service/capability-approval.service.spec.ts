import { describe, expect, it, vi } from 'vitest';
import { AgentOsError } from '../../domain/agent-os.errors';
import { CapabilityApprovalService } from './capability-approval.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const INPUT_HASH = 'a'.repeat(64);

describe('CapabilityApprovalService', () => {
  it('dispatches the exact persisted invocation once after recording approval', async () => {
    const approved = receipt({ approvalStatus: 'approved' });
    const dispatched = {
      ...approved,
      status: 'succeeded' as const,
      result: {
        summary: 'Listing submitted.',
        resourceRefs: [],
        operationRefs: [],
      },
      finishedAt: new Date('2026-08-25T00:01:01.000Z'),
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalStatus: 'pending' })),
      decideApproval: vi.fn().mockResolvedValue({ invocation: approved, transitioned: true }),
    };
    // This callable double keeps the pre-dispatch constructor executable for
    // the red phase while exposing the target injected dispatcher contract.
    const dispatcher = Object.assign(
      () => new Date('2026-08-25T00:00:00.000Z'),
      { dispatch: vi.fn().mockResolvedValue(dispatched) },
    );
    const service = new CapabilityApprovalService(
      repository as never,
      dispatcher as never,
      () => new Date('2026-08-25T00:00:00.000Z'),
    );

    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
      reason: 'User confirmed the exact mutation.',
    })).resolves.toMatchObject({
      status: 'succeeded',
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
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(approved);
  });

  it('does not let a browser supply a hash and reports immutable decision conflicts', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalStatus: 'pending' })),
      decideApproval: vi.fn().mockRejectedValue(new AgentOsError('APPROVAL_REJECTED')),
    };
    const service = new CapabilityApprovalService(repository as never, {
      dispatch: vi.fn(),
    });

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

  it('does not turn an already-approved duplicate decision into an owner retry after the transition winner is ambiguous', async () => {
    const approved = receipt({ approvalStatus: 'approved' });
    const repository = {
      findById: vi.fn().mockResolvedValue(approved),
      decideApproval: vi.fn()
        .mockResolvedValueOnce({ invocation: approved, transitioned: true })
        .mockResolvedValueOnce({ invocation: approved, transitioned: false }),
    };
    const dispatcher = {
      dispatch: vi.fn().mockRejectedValueOnce(
        new AgentOsError('OWNER_RESULT_AMBIGUOUS', 'Owner response was lost after dispatch.'),
      ),
    };
    const service = new CapabilityApprovalService(repository as never, dispatcher as never);
    const decision = {
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved' as const,
    };

    await expect(service.decide(decision)).rejects.toMatchObject({
      code: 'OWNER_RESULT_AMBIGUOUS',
    } satisfies Partial<AgentOsError>);
    await expect(service.decide(decision)).resolves.toEqual(approved);

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(approved);
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
