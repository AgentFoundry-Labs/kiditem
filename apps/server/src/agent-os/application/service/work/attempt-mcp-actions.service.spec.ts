import { describe, expect, it, vi } from 'vitest';
import { AttemptMcpActionsService } from './attempt-mcp-actions.service';
import { z } from 'zod';
import { deriveOwnerIdempotencyKey } from '../../../../common/owner-idempotency-key';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../../domain/catalog/final-capability.catalog';

const binding = {
  socketPath: '/tmp/attempt.sock', processGroupId: 1,
  capabilityKeys: ['supply.create_purchase_order_draft'],
  attemptId: 'attempt', organizationId: 'org', sessionId: 'session',
  taskId: 'task', agentVersionId: 'version', userId: 'user',
};

function setup() {
  const invocations = {
    invoke: vi.fn(async (value) => value),
    authorize: vi.fn(async (value) => ({
      invocationId: 'explicit-invocation', approvalId: null, invocationStatus: 'ready',
      approvalStatus: null, applicationVersion: '1', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli',
      ...value,
    })),
  };
  const delegation = { delegate: vi.fn() };
  const work = {
    assertAttemptMcpBinding: vi.fn().mockResolvedValue(true),
    loadAttemptMcpDelegationContext: vi.fn(),
    loadAttemptMcpDelegationReplay: vi.fn(),
    loadAttemptMcpChild: vi.fn(),
    loadAttemptMcpInvocation: vi.fn(),
  };
  const controls = { send: vi.fn(), interrupt: vi.fn() };
  const starter = { start: vi.fn() };
  const definitions = [
      { key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', description: 'draft', ownerInputPort: 'supply.purchaseOrderDraft', effects: ['db_write'], approvalRisk: 'low', idempotency: 'required', inputSchema: z.object({ productName: z.string(), amount: z.number() }).strict() },
      { key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', description: 'evidence', ownerInputPort: 'sourcing.workspaceEvidence', effects: ['read'], approvalRisk: 'none', idempotency: 'recommended', inputSchema: z.object({ query: z.string() }).strict() },
    ];
  const capabilities = {
    resolveDefinition: vi.fn((key: string) => definitions.find((definition) => definition.key === key)),
    listDefinitions: vi.fn(() => definitions),
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
  it('rejects a revoked membership before catalog reaches the capability registry', async () => {
    const { service, work, capabilities } = setup();
    work.assertAttemptMcpBinding.mockResolvedValueOnce(false);

    await expect(service.catalog({ binding, query: 'evidence' }))
      .rejects.toMatchObject({ code: 'attempt_mcp_binding_invalid' });
    expect(capabilities.listDefinitions).not.toHaveBeenCalled();
  });

  it('rejects a terminal Attempt before reading an invocation result', async () => {
    const { service, work } = setup();
    work.assertAttemptMcpBinding.mockResolvedValueOnce(false);

    await expect(service.invocation({
      binding,
      action: 'result',
      invocationId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toMatchObject({ code: 'attempt_mcp_binding_invalid' });
    expect(work.loadAttemptMcpInvocation).not.toHaveBeenCalled();
  });

  it('rejects a persisted capability snapshot drift before resolving a capability', async () => {
    const { service, work, capabilities, invocations } = setup();
    work.assertAttemptMcpBinding.mockResolvedValueOnce(false);

    await expect(service.invoke({
      invocationId: 'snapshot-drift',
      binding: { ...binding, capabilityKeys: ['sourcing.retrieveWorkspaceEvidence'] },
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
      input: { query: 'source' },
    })).rejects.toMatchObject({ code: 'attempt_mcp_binding_invalid' });
    expect(capabilities.resolveDefinition).not.toHaveBeenCalled();
    expect(invocations.invoke).not.toHaveBeenCalled();
  });

  it('revalidates a valid binding before every public MCP action', async () => {
    const { service, work, delegation } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: {}, applicationVersion: '1', authorizingGitSha: 'a'.repeat(40), cliVersion: '1',
      reportedModel: null, targetModel: 'target-model', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [],
      targetInstructionProfileRef: 'agent-config/prompts/agents/supply.md',
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt', attemptId: 'child-attempt',
      replayed: true, launchRequired: false, taskTerminal: false,
    });
    work.loadAttemptMcpInvocation.mockResolvedValue({
      invocationId: '11111111-1111-4111-8111-111111111111', status: 'succeeded',
      result: null, error: null, attemptStartedAt: new Date(),
    });
    work.loadAttemptMcpChild.mockResolvedValue({
      childTaskId: 'child', taskStatus: 'open', attemptId: 'child-attempt',
      attemptStatus: 'running', live: true, result: null, error: null,
    });

    await service.catalog({ binding });
    await service.invoke({
      invocationId: 'valid-action', binding,
      capabilityKey: 'supply.create_purchase_order_draft',
      input: { productName: 'Kid', amount: 1 },
    });
    await service.delegate({ binding, targetAgentKey: 'supply', objective: 'delegate' });
    await service.invocation({
      binding, action: 'status', invocationId: '11111111-1111-4111-8111-111111111111',
    });
    await service.child({ binding, action: 'status', childTaskId: 'child' });

    expect(work.assertAttemptMcpBinding).toHaveBeenCalledTimes(5);
    expect(work.assertAttemptMcpBinding).toHaveBeenLastCalledWith({
      organizationId: 'org',
      sessionId: 'session',
      taskId: 'task',
      attemptId: 'attempt',
      agentVersionId: 'version',
      requestedByUserId: 'user',
      capabilityKeys: ['supply.create_purchase_order_draft'],
    });
  });

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

  it('derives the owner key from the strict normalized MCP input, not its raw URL spelling', async () => {
    const { service, invocations, capabilities } = setup();
    capabilities.resolveDefinition.mockReturnValueOnce({
      key: 'sourcing.scrapeUrlWorkflow', ownerDomain: 'sourcing', effects: ['db_write'],
      inputSchema: z.object({ sourceUrl: z.string().transform((value) => value.split('#')[0]) }).strict(),
    });
    await service.invoke({ invocationId: 'scrape', binding: { ...binding, capabilityKeys: ['sourcing.scrapeUrlWorkflow'] }, capabilityKey: 'sourcing.scrapeUrlWorkflow', input: { sourceUrl: 'https://detail.1688.com/offer/1.html#fragment' } });
    expect(invocations.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
      ownerIdempotencyKey: deriveOwnerIdempotencyKey({ attemptId: 'attempt', capabilityKey: 'sourcing.scrapeUrlWorkflow', input: { sourceUrl: 'https://detail.1688.com/offer/1.html' } }),
    }));
  });

  it('discovers all public capabilities but grants a foreign read only for this exact Attempt/input', async () => {
    const { service, invocations } = setup();
    await expect(service.catalog({ binding, query: 'evidence' })).resolves.toMatchObject([{
      key: 'sourcing.retrieveWorkspaceEvidence',
      ownerDomain: 'sourcing',
      effects: ['read'],
      inputSchema: { encoding: 'json-schema-draft-07', json: expect.stringContaining('"type":"object"') },
    }]);
    await service.invoke({ invocationId: 'read', binding, capabilityKey: 'sourcing.retrieveWorkspaceEvidence', input: { query: 'source' } });
    expect(invocations.invoke).toHaveBeenCalledWith(expect.objectContaining({ authorizationKind: 'cross_domain_read_grant' }));
  });

  it('keeps representative nested Sourcing validation semantics in its bounded catalog schema', async () => {
    const { service, capabilities } = setup();
    const definition = FINAL_CAPABILITY_DEFINITIONS.find((item) => item.key === 'sourcing.ingestCandidate')!;
    capabilities.listDefinitions.mockReturnValue([definition]);

    const [catalog] = await service.catalog({ binding, query: 'ingestcandidate' });
    const inputSchema = catalog.inputSchema as { encoding: string; json: string };

    expect(inputSchema).toMatchObject({ encoding: 'json-schema-draft-07', json: expect.any(String) });
    expect(Buffer.byteLength(inputSchema.json, 'utf8')).toBeLessThan(16 * 1024);
    expect(JSON.parse(inputSchema.json)).toMatchObject({
      type: 'object',
      required: ['snapshot'],
      additionalProperties: false,
      properties: {
        snapshot: {
          type: 'object',
          required: expect.arrayContaining(['sourceUrl', 'images', 'contentHash']),
          additionalProperties: false,
          properties: {
            images: {
              type: 'array',
              maxItems: 40,
              items: { type: 'string', format: 'uri', maxLength: 2000 },
            },
            contentHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
      },
    });
  });

  it('requires delegation for a foreign mutation', async () => {
    const { service, capabilities } = setup();
    capabilities.resolveDefinition.mockReturnValueOnce({ key: 'channels.publish', ownerDomain: 'channels', effects: ['external_write'], inputSchema: z.object({}).strict() });
    await expect(service.invoke({ invocationId: 'mutate', binding, capabilityKey: 'channels.publish', input: {} })).rejects.toMatchObject({ code: 'capability_delegation_required' });
  });

  it('admits an exact cross-domain mutation grant on the explicitly selected owner child', async () => {
    const { service, work, delegation, invocations, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { parent: 'input' }, applicationVersion: '1.0.0', authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetModel: 'target-model', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [], rootTaskId: 'root-task',
      targetInstructionProfileRef: 'agent-config/prompts/agents/supply.md',
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt', attemptId: 'child-attempt',
      replayed: false, launchRequired: true, taskTerminal: false,
    });

    await expect(service.delegate({
      binding,
      targetAgentKey: 'supply',
      objective: 'Create the approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: { amount: 1, productName: 'Kid' },
    } as never)).resolves.toMatchObject({
      childTaskId: 'child', invocationId: 'explicit-invocation', invocationStatus: 'ready',
    });

    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        explicitExecutionGrant: expect.objectContaining({
          capabilityKey: 'supply.create_purchase_order_draft',
          input: { amount: 1, productName: 'Kid' },
          parentTaskId: binding.taskId,
          rootTaskId: 'root-task',
          delegatingAttemptId: binding.attemptId,
        }),
      }),
    }));
    expect(invocations.authorize).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'child', attemptId: 'child-attempt', agentVersionId: 'target-version',
      capabilityKey: 'supply.create_purchase_order_draft', authorizationKind: 'explicit_execution_grant',
      input: { amount: 1, productName: 'Kid' },
      ownerIdempotencyKey: deriveOwnerIdempotencyKey({
        attemptId: 'child-attempt', capabilityKey: 'supply.create_purchase_order_draft',
        input: { amount: 1, productName: 'Kid' },
      }),
    }));
    expect(starter.start).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'child-attempt' }));
  });

  it('does not reauthorize an explicit mutation when an exact child delegation replays after Continue', async () => {
    const { service, work, delegation, invocations, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { parent: 'input' }, applicationVersion: '1.0.0', authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetModel: 'target-model', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [], rootTaskId: 'root-task',
      targetInstructionProfileRef: 'agent-config/prompts/agents/supply.md',
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt-1', attemptId: 'child-attempt-2',
      replayed: true, launchRequired: false, taskTerminal: false,
    });

    await expect(service.delegate({
      binding,
      targetAgentKey: 'supply',
      objective: 'Create the approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: { amount: 1, productName: 'Kid' },
    } as never)).resolves.toMatchObject({
      childTaskId: 'child',
      firstAttemptId: 'child-attempt-1',
      attemptId: 'child-attempt-2',
    });

    expect(invocations.authorize).not.toHaveBeenCalled();
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('returns an existing child receipt without reading any target AgentVersion', async () => {
    const { service, work, delegation, invocations, starter } = setup();
    const explicitInput = { amount: 1, productName: 'Kid' };
    work.loadAttemptMcpDelegationReplay.mockResolvedValue({
      childTaskId: 'child',
      firstAttemptId: 'child-attempt-v1',
      attemptId: 'child-attempt-continue-v2',
      taskTerminal: false,
    });
    work.loadAttemptMcpDelegationContext.mockRejectedValue(new Error('current_active_target_must_not_be_read'));

    await expect(service.delegate({
      binding,
      targetAgentKey: 'supply',
      objective: 'Create the approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: explicitInput,
    } as never)).resolves.toEqual({
      childTaskId: 'child',
      firstAttemptId: 'child-attempt-v1',
      attemptId: 'child-attempt-continue-v2',
      replayed: true,
      launchRequired: false,
      taskTerminal: false,
    });

    expect(work.loadAttemptMcpDelegationContext).not.toHaveBeenCalled();
    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(invocations.authorize).not.toHaveBeenCalled();
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('does not reuse an exact receipt when canonical delegation input derives a different key', async () => {
    const { service, work, delegation, invocations, starter } = setup();
    const explicitInput = { amount: 1, productName: 'Kid' };
    work.loadAttemptMcpDelegationReplay
      .mockResolvedValueOnce({
        childTaskId: 'child',
        firstAttemptId: 'child-attempt-v1',
        attemptId: 'child-attempt-continue-v2',
        taskTerminal: false,
      })
      .mockResolvedValueOnce(null);
    work.loadAttemptMcpDelegationContext.mockRejectedValue(new Error('current_active_target_must_not_be_read'));

    await expect(service.delegate({
      binding,
      targetAgentKey: 'supply',
      objective: 'Create the approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: explicitInput,
    } as never)).resolves.toMatchObject({ childTaskId: 'child' });
    await expect(service.delegate({
      binding,
      targetAgentKey: 'supply',
      objective: 'Create a different approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: explicitInput,
    } as never)).rejects.toThrow('current_active_target_must_not_be_read');

    expect(work.loadAttemptMcpDelegationReplay).toHaveBeenCalledTimes(2);
    expect(work.loadAttemptMcpDelegationReplay.mock.calls[1][0].idempotencyKey)
      .not.toBe(work.loadAttemptMcpDelegationReplay.mock.calls[0][0].idempotencyKey);
    expect(work.loadAttemptMcpDelegationContext).toHaveBeenCalledTimes(1);
    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(invocations.authorize).not.toHaveBeenCalled();
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('coalesces concurrent explicit delegation followers so authorization and launch happen once', async () => {
    const { service, work, delegation, invocations, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { parent: 'input' }, applicationVersion: '1.0.0', authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetModel: 'target-model', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [], rootTaskId: 'root-task',
      targetInstructionProfileRef: 'agent-config/prompts/agents/supply.md',
    });
    const entered = deferred<void>();
    const release = deferred<{
      childTaskId: string;
      firstAttemptId: string;
      attemptId: string;
      replayed: boolean;
      launchRequired: boolean;
      taskTerminal: boolean;
    }>();
    delegation.delegate.mockImplementation(async () => {
      entered.resolve();
      return release.promise;
    });
    const input = {
      binding,
      targetAgentKey: 'supply',
      objective: 'Create the approved purchase-order draft.',
      capabilityKey: 'supply.create_purchase_order_draft',
      input: { amount: 1, productName: 'Kid' },
    } as never;

    const leader = service.delegate(input);
    await entered.promise;
    const follower = service.delegate(input);
    release.resolve({
      childTaskId: 'child', firstAttemptId: 'child-attempt', attemptId: 'child-attempt',
      replayed: false, launchRequired: true, taskTerminal: false,
    });

    await expect(Promise.all([leader, follower])).resolves.toEqual([
      expect.objectContaining({ childTaskId: 'child', invocationId: 'explicit-invocation' }),
      expect.objectContaining({ childTaskId: 'child', invocationId: 'explicit-invocation' }),
    ]);
    expect(delegation.delegate).toHaveBeenCalledTimes(1);
    expect(invocations.authorize).toHaveBeenCalledTimes(1);
    expect(starter.start).toHaveBeenCalledTimes(1);
  });

  it('delegates from a repository-owned attempt snapshot without Prisma in the MCP adapter', async () => {
    const { service, work, delegation, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { objective: 'source' }, applicationVersion: '1.0.0',
      authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0',
      reportedModel: 'model-1', targetModel: 'target-model', targetAgentVersionId: 'target-version',
      targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: ['supply.create_purchase_order_draft'], rootTaskId: 'root-task',
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt', attemptId: 'child-attempt',
      replayed: false, launchRequired: true, taskTerminal: false,
    });

    await expect(service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' }))
      .resolves.toMatchObject({ childTaskId: 'child' });
    expect(delegation.delegate).toHaveBeenCalledWith(expect.objectContaining({
      targetAgentVersionId: 'target-version', input: { objective: 'source' },
      idempotencyKey: deriveOwnerIdempotencyKey({ attemptId: 'attempt', capabilityKey: 'delegation.supply', input: { objective: 'submit' } }),
      reportedModel: 'target-model',
    }));
    expect(starter.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: 'child-attempt', agentVersionId: 'target-version', agentKey: 'supply', runtime: 'codex_cli', model: 'target-model',
    }));
  });

  it('never starts a replayed child Attempt again', async () => {
    const { service, work, delegation, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: {}, applicationVersion: '1', authorizingGitSha: 'a'.repeat(40), cliVersion: '1', reportedModel: null, targetModel: 'target-model',
      targetAgentVersionId: 'target-version', targetAgentKey: 'supply', targetRuntimeType: 'codex_cli', targetCapabilityKeys: [],
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt-1', attemptId: 'child-attempt-1',
      replayed: true, launchRequired: false, taskTerminal: true,
    });
    await service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' });
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('never starts a new child Attempt when an exact delegation replay is already terminal', async () => {
    const { service, work, delegation, starter } = setup();
    work.loadAttemptMcpDelegationContext.mockResolvedValue({
      input: { objective: 'source' }, applicationVersion: '1.0.0',
      authorizingGitSha: 'a'.repeat(40), cliVersion: '1.0.0', reportedModel: 'model-1', targetModel: 'target-model',
      targetAgentVersionId: 'target-version', targetAgentKey: 'supply', targetRuntimeType: 'codex_cli',
      targetCapabilityKeys: ['supply.create_purchase_order_draft'],
      targetInstructionProfileRef: 'agent-config/prompts/agents/supply.md',
    });
    delegation.delegate.mockResolvedValue({
      childTaskId: 'child', firstAttemptId: 'child-attempt-1', attemptId: 'child-attempt-2',
      replayed: true, launchRequired: true, taskTerminal: false,
    });

    await expect(service.delegate({ binding, targetAgentKey: 'supply', objective: 'submit' }))
      .resolves.toMatchObject({ childTaskId: 'child', attemptId: 'child-attempt-2' });

    expect(starter.start).not.toHaveBeenCalled();
  });

  it('returns pending approval and child facts without holding an old CLI Attempt for a wake-up', async () => {
    const { service, work } = setup();
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => {
      throw new Error('live_wait_forbidden');
    }) as never);
    work.loadAttemptMcpInvocation.mockResolvedValue({
      invocationId: '11111111-1111-4111-8111-111111111111',
      status: 'approval_pending',
      result: null,
      error: null,
      attemptStartedAt: new Date(),
    });
    work.loadAttemptMcpChild.mockResolvedValue({
      childTaskId: 'child',
      taskStatus: 'open',
      attemptId: 'child-attempt',
      attemptStatus: 'running',
      live: true,
      result: null,
      error: null,
    });

    try {
      await expect(service.invocation({
        binding,
        action: 'wait',
        invocationId: '11111111-1111-4111-8111-111111111111',
      })).resolves.toMatchObject({ status: 'approval_pending', terminal: false });
      await expect(service.child({ binding, action: 'wait', childTaskId: 'child' }))
        .resolves.toMatchObject({ childTaskId: 'child', terminal: false });
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it('preserves child status, message, and interrupt control through narrow ports', async () => {
    const { service, work, controls } = setup();
    work.loadAttemptMcpChild.mockResolvedValue({
      childTaskId: 'child', taskStatus: 'open', attemptId: 'child-attempt',
      attemptStatus: 'running', live: true,
    });

    await expect(service.child({ binding, action: 'status', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', attemptId: 'child-attempt', status: 'open', attemptStatus: 'running', terminal: false });
    await expect(service.child({
      binding,
      action: 'message',
      childTaskId: 'child',
      message: 'continue',
      turnId: 'mcp-7f8eb2c6d1',
    }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    await expect(service.child({ binding, action: 'interrupt', childTaskId: 'child' }))
      .resolves.toEqual({ childTaskId: 'child', status: 'open' });
    expect(controls.send).toHaveBeenCalledWith({
      attemptId: 'child-attempt',
      message: 'continue',
      turnId: 'mcp-7f8eb2c6d1',
    });
    expect(controls.interrupt).toHaveBeenCalledWith({ attemptId: 'child-attempt' });
  });

  it('returns the exact persisted approval or worker result only to its owning Attempt', async () => {
    const { service, work } = setup();
    work.loadAttemptMcpInvocation.mockResolvedValue({
      invocationId: '11111111-1111-4111-8111-111111111111', status: 'succeeded', error: null,
      result: { outcome: 'needs_input', summary: 'Approval completed.', resourceRefs: [{ kind: 'candidate', id: 'candidate-1', version: null }], operationRefs: [], needsInput: { code: 'confirm', prompt: 'Choose one.' }, output: { validationId: 'v1' } },
    });
    await expect(service.invocation({ binding, action: 'result', invocationId: '11111111-1111-4111-8111-111111111111' }))
      .resolves.toMatchObject({ terminal: true, result: { outcome: 'needs_input', needsInput: { code: 'confirm' }, output: { validationId: 'v1' } } });
    expect(work.loadAttemptMcpInvocation).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'attempt', invocationId: '11111111-1111-4111-8111-111111111111' }));
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
