import { describe, expect, it, vi } from 'vitest';
import { CapabilityInvocationController } from './capability-invocation.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';

describe('CapabilityInvocationController', () => {
  it('derives organization scope for an invocation read', async () => {
    const receipt = {
      capabilityKey: 'supply.submit_purchase_order',
      status: 'succeeded',
      approvalStatus: 'not_required',
      approvalExpiresAt: null,
      result: {
        summary: '발주서를 만들었습니다.',
        resourceRefs: [{ kind: 'purchase_order', id: 'purchase-order-1', version: null }],
      },
    };
    const invocations = { getReceipt: vi.fn().mockResolvedValue(receipt) };
    const controller = new CapabilityInvocationController(invocations as never, {
      decide: vi.fn(),
    } as never);

    await expect(controller.get(INVOCATION_ID, ORGANIZATION_ID)).resolves.toEqual(receipt);
    expect(invocations.getReceipt).toHaveBeenCalledWith({
      invocationId: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it('accepts only a bounded user approval decision and never accepts an input hash', async () => {
    const receipt = {
      capabilityKey: 'sourcing.publish_listing',
      status: 'pending',
      approvalStatus: 'approved',
      approvalExpiresAt: new Date('2026-08-26T00:00:00.000Z'),
      result: null,
    };
    const invocations = { getReceipt: vi.fn().mockResolvedValue(receipt) };
    const approvals = {
      decide: vi.fn().mockResolvedValue({
        ...receipt,
        requestKey: 'internal-request-key',
        inputHash: 'private-input-hash',
        approvalInputHash: 'private-approval-hash',
        decidedByUserId: USER_ID,
      }),
    };
    const controller = new CapabilityInvocationController(invocations as never, approvals as never);

    await expect(controller.decide(
      INVOCATION_ID,
      { decision: 'approved', reason: 'Reviewed by an operator' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).resolves.toEqual(receipt);
    expect(approvals.decide).toHaveBeenCalledWith({
      invocationId: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      decision: 'approved',
      reason: 'Reviewed by an operator',
    });
    expect(invocations.getReceipt).toHaveBeenCalledWith({
      invocationId: INVOCATION_ID,
      organizationId: ORGANIZATION_ID,
    });

    await expect(controller.decide(
      INVOCATION_ID,
      { decision: 'approved', inputHash: 'caller-controlled' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow();
  });
});
