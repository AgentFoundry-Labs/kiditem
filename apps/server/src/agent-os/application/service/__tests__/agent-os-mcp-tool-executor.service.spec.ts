import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentOsMcpToolExecutor } from '../agent-os-mcp-tool-executor.service';
import { KidItemMcpToolRegistry } from '../kiditem-mcp-tool-registry.service';

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

const claims = {
  organizationId: ids.organizationId,
  sessionId: ids.sessionId,
  executionId: ids.executionId,
  attemptId: ids.attemptId,
  startIntentId: ids.startIntentId,
  runtimeCredentialGeneration: 1,
};

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
    agentDefinitionKey: 'sourcing',
    agentVersion: 1,
    policyCapabilityKeys: [
      'analytics.readOverview',
      'sourcing.refreshCollection',
      'supply.submitPurchaseOrder',
    ],
    currentResourceRefs: [],
    taskGraph: [
      {
        taskId: ids.taskId,
        parentTaskId: null,
        objective: 'Inspect the exact session graph',
        status: 'running',
        agentDefinitionKey: 'sourcing',
      },
    ],
    artifacts: [
      {
        artifactId: '00000000-0000-4000-8000-000000000010',
        taskId: ids.taskId,
        executionId: ids.executionId,
        artifactType: 'test_result',
        sha256: 'a'.repeat(64),
        metadata: { label: 'bounded result' },
      },
    ],
    ...overrides,
  };
}

function setup(overrides: { graph?: Record<string, unknown> | null } = {}) {
  const registry = new AgentCapabilityRegistry();
  registry.register({
    key: 'sourcing.refreshCollection', ownerDomain: 'sourcing', executionKind: 'workflow',
    inputSchema: z.object({}), outputSchema: z.object({}), sideEffects: ['db_write', 'job_enqueue'],
    approvalRisk: 'low', idempotencyKey: () => 'refresh:one', execute: vi.fn(),
  });
  registry.register({
    key: 'product_listing.create_generation_package', ownerDomain: 'listing', executionKind: 'workflow',
    inputSchema: z.object({}), outputSchema: z.object({}), sideEffects: ['db_write'],
    approvalRisk: 'low', idempotencyKey: () => 'listing:one', execute: vi.fn(),
  });
  registry.register({
    key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', executionKind: 'workflow',
    inputSchema: z.object({}), outputSchema: z.object({}), sideEffects: ['db_write'],
    approvalRisk: 'low', idempotencyKey: () => 'order:one', execute: vi.fn(),
  });
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
  const contexts = {
    loadRuntimeExecutionGraph: vi.fn().mockResolvedValue(
      overrides.graph === undefined ? graph() : overrides.graph,
    ),
  };
  const capabilities = { invoke: vi.fn().mockResolvedValue({ outputSummary: {} }) };
  const transitions = {
    transitionTask: vi.fn().mockResolvedValue({ id: ids.taskId, status: 'completed' }),
  };
  return {
    contexts,
    capabilities,
    transitions,
    executor: new AgentOsMcpToolExecutor(
      contexts as never,
      capabilities as never,
      registry,
      new KidItemMcpToolRegistry(registry),
      transitions as never,
    ),
  };
}

describe('AgentOsMcpToolExecutor', () => {
  it('derives bounded context only from an exact DB-verified local execution coordinate', async () => {
    const { executor, contexts } = setup();
    await expect(executor.execute({
      context: claims,
      toolName: 'agent_os_read_context', arguments: {},
    })).resolves.toMatchObject({
      organization: `organizations/${ids.organizationId}`,
      actor: `users/${ids.userId}`,
      requestId: ids.startIntentId,
      operation: `organizations/${ids.organizationId}/operations/${ids.operationRunId}`,
    });
    expect(contexts.loadRuntimeExecutionGraph).toHaveBeenCalledWith(claims);
  });

  it.each([
    ['stale execution generation', { graph: null }],
    ['cross-organization graph drift', { graph: graph({ organizationId: '00000000-0000-4000-8000-000000000099' }) }],
    ['inactive binding', { graph: graph({ operationStatus: 'cancelled' }) }],
  ])('fails closed on %s without invoking owner capability', async (_label, failure) => {
    const setupResult = setup();
    setupResult.contexts.loadRuntimeExecutionGraph.mockResolvedValue(failure.graph);
    await expect(setupResult.executor.execute({
      context: claims,
      toolName: 'analytics_read_overview', arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_EXECUTION_DENIED' });
    expect(setupResult.capabilities.invoke).not.toHaveBeenCalled();
  });

  it('enumerates canonical common and low-risk capability names while keeping high-risk writes approval-gated', async () => {
    const { executor, capabilities } = setup();
    await expect(executor.listAvailableTools(claims)).resolves.toEqual([
      { name: 'agent_os_read_context' },
      { name: 'agent_os_read_task_graph' },
      { name: 'agent_os_read_artifacts' },
      { name: 'sourcing_refresh_collection' },
    ]);
    await executor.execute({
      context: claims,
      toolName: 'sourcing_refresh_collection',
      arguments: {},
    });
    expect(capabilities.invoke).toHaveBeenLastCalledWith(expect.objectContaining({
      invocationSurface: 'mcp_runtime',
      capabilityKey: 'sourcing.refreshCollection',
      input: {},
    }));
    await expect(executor.execute({
      context: claims,
      toolName: 'supply_submit_purchase_order', arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_TOOL_UNSUPPORTED' });
  });

  it('uses the same first-class listing and order names as the local CLI allowlist', async () => {
    const { executor } = setup();
    await expect(executor.listAvailableTools(claims)).resolves.toEqual(
      expect.not.arrayContaining([
        { name: 'product_listing_create_generation_package' },
        { name: 'supply_create_purchase_order_draft' },
      ]),
    );
    await expect(executor.listAvailableTools({ ...claims })).resolves.toEqual(
      expect.arrayContaining([{ name: 'agent_os_read_context' }]),
    );

    const listing = setup({
      graph: graph({
        agentDefinitionKey: 'listing',
        policyCapabilityKeys: ['product_listing.create_generation_package'],
      }),
    });
    await expect(listing.executor.listAvailableTools(claims)).resolves.toEqual([
      { name: 'agent_os_read_context' },
      { name: 'agent_os_read_task_graph' },
      { name: 'agent_os_read_artifacts' },
      { name: 'agent_os_finalize_task' },
      { name: 'listing_create_generation_package' },
    ]);

    const order = setup({
      graph: graph({
        agentDefinitionKey: 'order',
        policyCapabilityKeys: ['supply.create_purchase_order_draft'],
      }),
    });
    await expect(order.executor.listAvailableTools(claims)).resolves.toEqual([
      { name: 'agent_os_read_context' },
      { name: 'agent_os_read_task_graph' },
      { name: 'agent_os_read_artifacts' },
      { name: 'agent_os_finalize_task' },
      { name: 'order_create_purchase_order_draft' },
    ]);
  });

  it('returns the bounded exact task graph and artifact projection', async () => {
    const { executor } = setup();
    await expect(executor.execute({
      context: claims,
      toolName: 'agent_os_read_task_graph',
      arguments: {},
    })).resolves.toEqual({ tasks: graph().taskGraph });
    await expect(executor.execute({
      context: claims,
      toolName: 'agent_os_read_artifacts',
      arguments: {},
    })).resolves.toEqual({ artifacts: graph().artifacts });
  });

  it('persists a bounded terminal task transition instead of acknowledging finalization as a no-op', async () => {
    const { executor, transitions } = setup({
      graph: graph({ agentDefinitionKey: 'listing' }),
    });

    await expect(executor.execute({
      context: claims,
      toolName: 'agent_os_finalize_task',
      arguments: {
        status: 'succeeded',
        summary: 'The listing package is ready for review.',
        artifactIds: [graph().artifacts[0].artifactId],
      },
    })).resolves.toMatchObject({
      task: {
        name: `organizations/${ids.organizationId}/agentSessions/${ids.sessionId}/tasks/${ids.taskId}`,
        status: 'completed',
      },
    });
    expect(transitions.transitionTask).toHaveBeenCalledWith({
      organizationId: ids.organizationId,
      sessionId: ids.sessionId,
      taskId: ids.taskId,
      expectedState: 'running',
      state: 'completed',
    });
  });

  it.each([
    'agent_os_list_agents', 'agent_os_create_task', 'agent_os_request_user_input',
    'kiditem_capabilities_list', 'kiditem_capability_invoke',
  ])('rejects unsupported legacy MCP tool %s', async (toolName) => {
    const { executor } = setup();
    await expect(executor.execute({
      context: claims, toolName, arguments: {},
    })).rejects.toMatchObject({ code: 'MCP_TOOL_UNSUPPORTED' });
  });
});
