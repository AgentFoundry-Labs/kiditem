import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentOsMcpToolExecutor } from '../agent-os-mcp-tool-executor.service';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  sessionId: '00000000-0000-4000-8000-000000000003',
  taskId: '00000000-0000-4000-8000-000000000004',
  executionId: '00000000-0000-4000-8000-000000000005',
  attemptId: '00000000-0000-4000-8000-000000000006',
  operationRunId: '00000000-0000-4000-8000-000000000007',
  startIntentId: '00000000-0000-4000-8000-000000000008',
};

const claims = { ...ids, runtimeCredentialGeneration: 1 };

function graph(overrides: Record<string, unknown> = {}) {
  return {
    ...ids,
    sessionTaskId: ids.taskId,
    executionStatus: 'running',
    sessionLifecycle: 'active',
    taskStatus: 'running',
    attemptState: 'running',
    startIntentId: ids.startIntentId,
    runtimeCredentialGeneration: 1,
    operationStatus: 'running',
    operationAttemptToken: '00000000-0000-4000-8000-000000000009',
    agentDefinitionKey: 'operator',
    agentVersion: 1,
    policyCapabilityKeys: ['analytics.readOverview', 'supply.submitPurchaseOrder'],
    currentResourceRefs: [],
    ...overrides,
  };
}

function setup(overrides: { graph?: Record<string, unknown> | null; verify?: unknown } = {}) {
  const registry = new AgentCapabilityRegistry();
  registry.register({
    key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
    inputSchema: z.object({ period: z.string().optional() }), outputSchema: z.object({}),
    sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
    execute: vi.fn(),
  });
  registry.register({
    key: 'supply.submitPurchaseOrder', ownerDomain: 'supply', executionKind: 'tool',
    inputSchema: z.object({}), outputSchema: z.object({}), sideEffects: ['db_write'],
    approvalRisk: 'high', idempotencyKey: () => null, execute: vi.fn(),
  });
  const credentials = { verify: vi.fn().mockResolvedValue(overrides.verify ?? claims) };
  const contexts = {
    loadRuntimeCredentialExecutionGraph: vi.fn().mockResolvedValue(
      overrides.graph === undefined ? graph() : overrides.graph,
    ),
  };
  const capabilities = { invoke: vi.fn().mockResolvedValue({ outputSummary: {} }) };
  return {
    credentials,
    contexts,
    capabilities,
    executor: new AgentOsMcpToolExecutor(credentials as never, contexts as never, capabilities as never, registry),
  };
}

describe('AgentOsMcpToolExecutor', () => {
  it('derives the bounded read context only from a verified exact credential graph', async () => {
    const { executor, contexts } = setup();
    await expect(executor.execute({
      context: { credential: 'issued-runtime-credential' },
      toolName: 'agent_os_read_context', arguments: {},
    })).resolves.toMatchObject({
      organization: `organizations/${ids.organizationId}`,
      actor: `users/${ids.userId}`,
      requestId: ids.startIntentId,
      operation: `organizations/${ids.organizationId}/operations/${ids.operationRunId}`,
    });
    expect(contexts.loadRuntimeCredentialExecutionGraph).toHaveBeenCalledWith(claims);
  });

  it.each([
    ['revoked credential', { verify: new Error('RUNTIME_CREDENTIAL_REVOKED') }],
    ['cross-organization graph drift', { graph: graph({ organizationId: '00000000-0000-4000-8000-000000000099' }) }],
    ['inactive binding', { graph: graph({ operationStatus: 'cancelled' }) }],
  ])('fails closed on %s without invoking owner capability', async (_label, failure) => {
    const setupResult = setup();
    if ('verify' in failure) setupResult.credentials.verify.mockRejectedValue(failure.verify);
    if ('graph' in failure) setupResult.contexts.loadRuntimeCredentialExecutionGraph.mockResolvedValue(failure.graph);
    await expect(setupResult.executor.execute({
      context: { credential: 'issued-runtime-credential' },
      toolName: 'analytics_read_overview', arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_EXECUTION_DENIED' });
    expect(setupResult.capabilities.invoke).not.toHaveBeenCalled();
  });

  it('enumerates and invokes only policy-registered read-only capabilities', async () => {
    const { executor, capabilities } = setup();
    await expect(executor.listAvailableTools({ credential: 'issued-runtime-credential' })).resolves.toEqual([
      { name: 'agent_os_read_context' },
      { name: 'analytics_read_overview' },
    ]);
    await executor.execute({
      context: { credential: 'issued-runtime-credential' },
      toolName: 'analytics_read_overview', arguments: { period: 'month' },
    });
    expect(capabilities.invoke).toHaveBeenCalledWith(expect.objectContaining({
      capabilityKey: 'analytics.readOverview', input: { period: 'month' },
    }));
    await expect(executor.execute({
      context: { credential: 'issued-runtime-credential' },
      toolName: 'supply_submit_purchase_order', arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_TOOL_UNSUPPORTED' });
  });

  it.each([
    'agent_os_read_task_graph', 'agent_os_read_artifacts', 'agent_os_finalize_task',
    'agent_os_list_agents', 'agent_os_create_task', 'agent_os_request_user_input',
    'kiditem_capabilities_list', 'kiditem_capability_invoke',
  ])('rejects unsupported legacy MCP tool %s', async (toolName) => {
    const { executor } = setup();
    await expect(executor.execute({
      context: { credential: 'issued-runtime-credential' }, toolName, arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_TOOL_UNSUPPORTED' });
  });
});
