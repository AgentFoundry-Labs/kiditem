import { describe, expect, it, vi } from 'vitest';
import { AgentSessionDelegationService } from '../agent-session-delegation.service';

const context = {
  sessionLifecycle: 'active', taskStatus: 'running', parentAgentVersionId: 'version-operator',
  parentExecutionId: 'execution-parent', parentDepth: 0, childCount: 0,
  parentManifest: {
    schemaVersion: 1, agentDefinitionKey: 'operator', runtimeKind: 'coordinator', runtimeType: 'hermes_http', modelIdentity: 'gpt-test',
    capabilityKeys: ['analytics.readOverview'], policyDocument: {},
    delegation: { role: 'orchestrator', allowedAgentDefinitionKeys: ['sourcing'], maxDepth: 2, maxChildrenPerTask: 2 },
    limits: { maxTurns: 40, maxContextTokens: 32_000, summaryTargetTokens: 1_024 },
    assets: { prompt: { path: 'agent-config/prompts/agents/manager.md', sha256: 'a'.repeat(64) }, summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'b'.repeat(64) }, skills: [], outputSchema: null },
  },
  targetAgentVersionId: 'version-sourcing', targetDefinitionKey: 'sourcing',
  targetCapabilityKeys: ['analytics.readOverview'], activeTarget: true,
  parentPolicyCapabilityKeys: ['analytics.readOverview'],
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1', sessionId: 'session-1', parentTaskId: 'task-parent',
    parentExecutionId: 'execution-parent', targetAgentDefinitionKey: 'sourcing',
    objective: '  상품   근거를 검증한다  ', authoritySubset: ['analytics.readOverview'],
    idempotencyKey: 'delegate:sourcing:proof', ...overrides,
  };
}

describe('AgentSessionDelegationService', () => {
  it('creates one bounded child graph and dispatches only after commit', async () => {
    const repository = {
      loadDelegationContext: vi.fn().mockResolvedValue(context),
      createDelegatedTask: vi.fn().mockResolvedValue({ delegationId: 'delegation-1', childTaskId: 'task-child', childExecutionId: 'execution-child', state: 'created' }),
    };
    const dispatch = { dispatch: vi.fn().mockResolvedValue({ operationsRunId: 'operation-1' }) };
    const service = new AgentSessionDelegationService(repository as never, dispatch as never);

    const result = await service.delegate(input());

    expect(repository.createDelegatedTask).toHaveBeenCalledWith(expect.objectContaining({
      objective: '상품 근거를 검증한다', depth: 1, toAgentVersionId: 'version-sourcing',
    }));
    expect(dispatch.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-child', executionId: 'execution-child',
    }));
    expect(result.operationsRunId).toBe('operation-1');
    expect(repository.createDelegatedTask.mock.invocationCallOrder[0]).toBeLessThan(dispatch.dispatch.mock.invocationCallOrder[0]);
  });

  it.each([
    ['leaf', { parentManifest: { ...context.parentManifest, delegation: { role: 'leaf', allowedAgentDefinitionKeys: [], maxDepth: 0, maxChildrenPerTask: 0 } } }],
    ['target', { targetDefinitionKey: 'order' }],
    ['depth', { parentDepth: 2 }],
    ['children', { childCount: 2 }],
    ['authority', { parentPolicyCapabilityKeys: [] }],
    ['inactive', { activeTarget: false }],
  ])('rejects out-of-policy delegation: %s', async (_case, override) => {
    const repository = { loadDelegationContext: vi.fn().mockResolvedValue({ ...context, ...override }), createDelegatedTask: vi.fn() };
    const service = new AgentSessionDelegationService(repository as never, { dispatch: vi.fn() } as never);
    await expect(service.delegate(input())).rejects.toMatchObject({ code: 'AGENT_DELEGATION_NOT_ALLOWED' });
    expect(repository.createDelegatedTask).not.toHaveBeenCalled();
  });
});
