import { describe, expect, it, vi } from 'vitest';
import { AgentOsError } from '../../domain/agent-os.errors';
import { CapabilityApprovalService } from './capability-approval.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const INPUT_HASH = 'a'.repeat(64);
const BEFORE_EXPIRY = new Date('2026-08-25T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-25T00:30:00.000Z');

describe('CapabilityApprovalService', () => {
  it('dispatches the exact persisted invocation once after recording approval', async () => {
    const approved = receipt({ approvalDecision: 'approved' });
    const dispatched = {
      ...approved,
      status: 'succeeded' as const,
      result: {
        summary: 'Listing submitted.',
        resourceRefs: [],
      },
      finishedAt: new Date('2026-08-25T00:01:01.000Z'),
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalDecision: null })),
      decideApproval: vi.fn().mockResolvedValue({ invocation: approved, transitioned: true }),
    };
    // This callable double keeps the pre-dispatch constructor executable for
    // the red phase while exposing the target injected dispatcher contract.
    const dispatcher = Object.assign(
      () => BEFORE_EXPIRY,
      { dispatch: vi.fn().mockResolvedValue(dispatched) },
    );
    const service = new CapabilityApprovalService(
      repository as never,
      dispatcher as never,
      () => BEFORE_EXPIRY,
    );

    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
      reason: 'User confirmed the exact mutation.',
    })).resolves.toMatchObject({
      status: 'succeeded',
      approvalDecision: 'approved',
      inputHash: INPUT_HASH,
    });
    expect(repository.decideApproval).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
      inputHash: INPUT_HASH,
      decidedAt: BEFORE_EXPIRY,
    }));
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(approved);
  });

  it('does not let a browser supply a hash and reports immutable decision conflicts', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalDecision: null })),
      decideApproval: vi.fn().mockRejectedValue(new AgentOsError('APPROVAL_REJECTED')),
    };
    const service = new CapabilityApprovalService(repository as never, {
      dispatch: vi.fn(),
    }, () => BEFORE_EXPIRY);

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

  it('refuses a decision once the approval window closed, even before the expiry sweep failed it', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(receipt({ approvalDecision: null })),
      decideApproval: vi.fn(),
    };
    const dispatcher = { dispatch: vi.fn() };
    const service = new CapabilityApprovalService(
      repository as never,
      dispatcher,
      () => EXPIRES_AT,
    );

    await expect(service.decide({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      invocationId: INVOCATION_ID,
      decision: 'approved',
    })).rejects.toMatchObject({ code: 'APPROVAL_EXPIRED' } satisfies Partial<AgentOsError>);
    expect(repository.decideApproval).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('does not turn an already-approved duplicate decision into an owner retry after the transition winner is ambiguous', async () => {
    const approved = receipt({ approvalDecision: 'approved' });
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

function receipt(input: { approvalDecision: 'approved' | 'rejected' | null }) {
  const decided = input.approvalDecision !== null;
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: 'channels.report_target_execution',
    actingAgentKey: 'channel_operations',
    requestKey: 'request-1',
    canonicalInput: { preparationId: '00000000-0000-4000-8000-000000000004' },
    inputHash: INPUT_HASH,
    status: input.approvalDecision === 'rejected' ? 'failed' : 'pending',
    approvalInputHash: INPUT_HASH,
    approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
    approvalExpiresAt: EXPIRES_AT,
    approvalDecision: input.approvalDecision,
    approvalDecidedByUserId: decided ? USER_ID : null,
    approvalDecisionReason: null,
    approvalDecidedAt: decided ? new Date('2026-08-25T00:01:00.000Z') : null,
    result: null,
    error: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:01:00.000Z'),
    finishedAt: null,
  };
}
