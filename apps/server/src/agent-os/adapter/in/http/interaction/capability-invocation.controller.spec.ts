import { describe, expect, it, vi } from 'vitest';
import { CapabilityInvocationController } from './capability-invocation.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';

describe('CapabilityInvocationController', () => {
  it('derives organization scope for an invocation read', async () => {
    const invocations = { get: vi.fn().mockResolvedValue({ id: INVOCATION_ID }) };
    const controller = new CapabilityInvocationController(invocations as never, {
      decide: vi.fn(),
    } as never);

    await expect(controller.get(INVOCATION_ID, ORGANIZATION_ID)).resolves.toEqual({
      id: INVOCATION_ID,
    });
    expect(invocations.get).toHaveBeenCalledWith({
      invocationId: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it('accepts only a bounded user approval decision and never accepts an input hash', async () => {
    const approvals = { decide: vi.fn().mockResolvedValue({ id: INVOCATION_ID, approvalStatus: 'approved' }) };
    const controller = new CapabilityInvocationController({ get: vi.fn() } as never, approvals as never);

    await expect(controller.decide(
      INVOCATION_ID,
      { decision: 'approved', reason: 'Reviewed by an operator' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).resolves.toEqual({ id: INVOCATION_ID, approvalStatus: 'approved' });
    expect(approvals.decide).toHaveBeenCalledWith({
      invocationId: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      decision: 'approved',
      reason: 'Reviewed by an operator',
    });

    await expect(controller.decide(
      INVOCATION_ID,
      { decision: 'approved', inputHash: 'caller-controlled' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow();
  });
});
