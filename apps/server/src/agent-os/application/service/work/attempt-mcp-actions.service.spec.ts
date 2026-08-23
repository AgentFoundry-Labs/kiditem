import { describe, expect, it, vi } from 'vitest';
import { AttemptMcpActionsService } from './attempt-mcp-actions.service';
import { z } from 'zod';

const binding = {
  socketPath: '/tmp/attempt.sock', processGroupId: 1,
  capabilityKeys: ['supply.create_purchase_order_draft'],
  attemptId: 'attempt', organizationId: 'org', sessionId: 'session',
  taskId: 'task', agentVersionId: 'version', userId: 'user',
};

function setup() {
  const invocations = { invoke: vi.fn(async (value) => value) };
  const delegation = { delegate: vi.fn() };
  const work = {
    loadAttemptMcpDelegationContext: vi.fn(),
    loadAttemptMcpChild: vi.fn(),
  };
  const controls = { send: vi.fn(), interrupt: vi.fn() };
  const starter = { start: vi.fn() };
  const capabilities = {
    resolveDefinition: vi.fn((key: string) => ({ key, ownerDomain: key.split('.')[0], effects: key.includes('create') ? ['db_write'] : ['read'] })),
    listDefinitions: vi.fn(() => [
      { key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', description: 'draft', ownerInputPort: 'supply.purchaseOrderDraft', effects: ['db_write'], approvalRisk: 'low', idempotency: 'required', inputSchema: z.object({}).strict() },
      { key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', description: 'evidence', ownerInputPort: 'sourcing.workspaceEvidence', effects: ['read'], approvalRisk: 'none', idempotency: 'recommended', inputSchema: z.object({}).strict() },
    ]),
  };
  return {
    service: new AttemptMcpActionsService(
      invocations as never,
      delegation as never,
      work as never,
      controls,
      starter,
      capabilities,
    ),
    invocations,
    delegation,
    work,
    controls, starter, capabilities,
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

    expect(invocations.invoke.mock.calls[0][0].ownerIdempotencyKey)
      .toBe(invocations.invoke.mock.calls[1][0].ownerIdempotencyKey);
  });

  it('discovers all public capabilities but grants a foreign read only for this exact Attempt/input', async () => {
    const { service, invocations } = setup();
    await expect(service.catalog({ binding, query: 'evidence' })).resolves.toMatchObject([{ key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', effects: ['read'], inputSchema: { type: 'object' } }]);
    await service.invoke({ invocationId: 'read', binding, capabilityKey: 'sourcing.retrieveWorkspaceEvidence', input: { query: 'source' } });
    expect(invocations.invoke).toHaveBeenCalledWith(expect.objectContaining({ authorizationKind: 'cross_domain_read_grant' }));
  });

  it('requires delegation for a foreign mutation', async () => {
    const { service, capabilities } = setup();
    capabilities.resolveDefinition.mockReturnValueOnce({ key: 'channels.publish', ownerDomain: 'channels', effects: ['external_write'] });
    await expect(service.invoke({ invocationId: 'mutate', binding, capabilityKey: 'channels.publish', input: {} })).rejects.toMatchObject({ code: 'capability_delegation_required' });
  });

  it('delegates from a repository-owned attempt snapshot without Prisma in the MCP adapter', async () => {
    const { service, work, delegation, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { objective: 'source' }, applicationVersion: '1.0.0',
      authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: ['supply.create_purchase_order_draft'],
    });
    delegation.delegate.mockResolvedValue({ childTaskId: 'child', firstAttemptId: 'child-attempt', replayed: false });

    await expect(service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' }))
      .resolves.toMatchObject({ childTaskId: 'child' });
    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      targetAgentVersionId: 'target-version', input: { objective: 'source' },
      idempotencyKey: 'attempt:attempt:delegate:supply:submit',
    }));
    expect(starter.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: 'child-attempt', agentVersionId: 'target-version', agentKey: 'supply', runtime: 'codex_cli',
    }));
  });

  it('never starts a replayed child Attempt again', async () => {
    const { service, work, delegation, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: {}, applicationVersion: '1', authorizingGitSha: 'a'.repeat(40), cliVersion: '1', reportedModel: null,
      targetAgentVersionId: 'target-version', targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [],
    });
    delegation.delegate.mockResolvedValue({ childTaskId: 'child', firstAttemptId: 'child-attempt', replayed: true });
    await service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' });
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('preserves child status, message, and interrupt control through narrow ports', async () => {
    const { service, work, controls } = setup();
    work.loadAttemptMcpChild.mockResolvedValue({
      childTaskId: 'child', taskStatus: 'open', attemptId: 'child-attempt',
      attemptStatus: 'running', live: true,
    });

    await expect(service.child({ binding, action: 'status', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', attemptId: 'child-attempt', status: 'open', attemptStatus: 'running', terminal: false });
    await expect(service.child({ binding, action: 'message', childTaskId: 'child', message: 'continue' }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    await expect(service.child({ binding, action: 'interrupt', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    expect(controls.send).toHaveBeenCalledWith({ attemptId: 'child-attempt', message: 'continue' });
    expect(controls.interrupt).toHaveBeenCalledWith({ attemptId: 'child-attempt' });
  });
});
