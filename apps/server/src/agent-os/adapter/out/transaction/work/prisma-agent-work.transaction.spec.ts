import { describe, expect, it, vi } from 'vitest';
import { PrismaAgentWorkTransaction } from './prisma-agent-work.transaction';

describe('PrismaAgentWorkTransaction delegation replay lookup', () => {
  it('conflicts on a same-key changed hash before the admission service can reserve capacity', async () => {
    const tx = {
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          organization_id: 'organization-1',
          created_by_user_id: 'user-1',
        },
      ]),
      agentTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'child-1',
          delegationRequestHash: 'a'.repeat(64),
          attempts: [{ id: 'attempt-1' }],
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const work = new PrismaAgentWorkTransaction(prisma as never);

    await expect(work.findDelegationReplay({
      organizationId: 'organization-1',
      sessionId: 'session-1',
      parentTaskId: 'parent-1',
      delegatingAttemptId: 'delegating-attempt-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'delegation-key-1',
      requestHash: 'b'.repeat(64),
    })).rejects.toMatchObject({ code: 'delegation_idempotency_conflict' });
    expect(tx.agentTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1',
        sessionId: 'session-1',
        parentTaskId: 'parent-1',
        delegatedFromAttemptId: 'delegating-attempt-1',
        delegationIdempotencyKey: 'delegation-key-1',
      }),
    }));
  });
});
