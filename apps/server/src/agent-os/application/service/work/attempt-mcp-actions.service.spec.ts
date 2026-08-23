import { describe, expect, it, vi } from 'vitest';
import { AttemptMcpActionsService } from './attempt-mcp-actions.service';

const binding = {
  socketPath: '/tmp/attempt.sock', processGroupId: 1,
  capabilityKeys: ['supply.create_purchase_order_draft'],
  attemptId: 'attempt', organizationId: 'org', sessionId: 'session',
  taskId: 'task', agentVersionId: 'version', userId: 'user',
};

function setup() {
  const invocations = { authorize: vi.fn(async (value) => value) };
  const delegation = { delegate: vi.fn() };
  const work = {
    loadAttemptMcpDelegationContext: vi.fn(),
    loadAttemptMcpChild: vi.fn(),
  };
  const controls = { send: vi.fn(), interrupt: vi.fn() };
  return {
    service: new AttemptMcpActionsService(
      invocations as never,
      delegation as never,
      work as never,
      controls,
    ),
    invocations,
    delegation,
    work,
    controls,
  };
}

describe('AttemptMcpActionsService', () => {
  it('uses a stable server-owned mutation idempotency key for an exact retry', async () => {
    const { service, invocations } = setup();
    const input = {
      invocationId: 'random-one', binding,
      capabilityKey: 'supply.create_purchase_order_draft',
      input: { productName: 'Kid', amount: 1 },
    };

    await service.invoke(input);
    await service.invoke({ ...input, invocationId: 'random-two' });

    expect(invocations.authorize.mock.calls[0][0].ownerIdempotencyKey)
      .toBe(invocations.authorize.mock.calls[1][0].ownerIdempotencyKey);
  });

  it('delegates from a repository-owned attempt snapshot without Prisma in the MCP adapter', async () => {
    const { service, work, delegation } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { objective: 'source' }, applicationVersion: '1.0.0',
      authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetAgentVersionId: 'target-version',
    });
    delegation.delegate.mockResolvedValue({ childTaskId: 'child', firstAttemptId: 'child-attempt', replayed: false });

    await expect(service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' }))
      .resolves.toMatchObject({ childTaskId: 'child' });
    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      targetAgentVersionId: 'target-version', input: { objective: 'source' },
      idempotencyKey: 'attempt:attempt:delegate:supply:submit',
    }));
  });

  it('preserves child status, message, and interrupt control through narrow ports', async () => {
    const { service, work, controls } = setup();
    work.loadAttemptMcpChild.mockResolvedValue({
      childTaskId: 'child', taskStatus: 'open', attemptId: 'child-attempt',
      attemptStatus: 'running', live: true,
    });

    await expect(service.child({ binding, action: 'status', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', attemptId: 'child-attempt', status: 'open', attemptStatus: 'running' });
    await expect(service.child({ binding, action: 'message', childTaskId: 'child', message: 'continue' }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    await expect(service.child({ binding, action: 'interrupt', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    expect(controls.send).toHaveBeenCalledWith({ attemptId: 'child-attempt', message: 'continue' });
    expect(controls.interrupt).toHaveBeenCalledWith({ attemptId: 'child-attempt' });
  });
});
