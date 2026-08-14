import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentSessionCapabilityInvocationService } from '../agent-session-capability-invocation.service';

const graph = (overrides: Record<string, unknown> = {}) => ({
  organizationId: 'org-1',
  userId: 'user-1',
  agentDefinitionKey: 'operator',
  sessionId: 'session-1',
  sessionTaskId: 'task-1',
  executionId: 'execution-1',
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
  agentVersionId: 'version-1',
  runtimeType: 'copilotkit_agui',
  modelIdentity: 'gpt-5.2',
  policySnapshotId: 'policy-1',
  policyHash: 'a'.repeat(64),
  contextEpoch: 1,
  lifecycle: 'active',
  capabilityKeys: ['analytics.readOverview'],
  initialUserEvent: {
    id: 'event-1',
    organizationId: 'org-1',
    sessionId: 'session-1',
    executionId: 'execution-1',
    externalEventId: 'message-1',
    sequence: 1n,
    eventType: 'user_message',
    schemaVersion: 1,
    payload: { phase: 'complete', messageId: 'message-1', content: 'hello' },
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
  },
  ...overrides,
});

function setup(overrides: {
  runtimeContext?: Record<string, unknown> | null;
  allowed?: boolean;
} = {}) {
  const capabilities = new AgentCapabilityRegistry();
  const execute = vi.fn().mockResolvedValue({
    outputSummary: { title: 'Inventory overview' },
  });
  capabilities.register({
    key: 'analytics.readOverview',
    ownerDomain: 'analytics',
    executionKind: 'tool',
    inputSchema: z.object({ period: z.enum(['day', 'week']).default('day') }),
    outputSchema: z.object({ title: z.string() }),
    sideEffects: ['read'],
    approvalRisk: 'none',
    idempotencyKey: () => null,
    execute,
  });
  const interactions = {
    loadExecutionRuntimeContext: vi.fn().mockResolvedValue(
      overrides.runtimeContext === undefined ? graph() : overrides.runtimeContext,
    ),
  };
  const controls = {
    isExecutionCapabilityAllowed: vi
      .fn()
      .mockResolvedValue(overrides.allowed ?? true),
  };
  const service = new AgentSessionCapabilityInvocationService(
    interactions as never,
    controls as never,
    capabilities,
  );
  return { service, interactions, controls, capabilities, execute };
}

const input = (overrides: Record<string, unknown> = {}) => ({
  session: formatAgentSessionName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
  ),
  task: formatAgentSessionTaskName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
    AgentSessionTaskIdSchema.parse('task-1'),
  ),
  execution: formatAgentExecutionName(
    OrganizationIdSchema.parse('org-1'),
    AgentSessionIdSchema.parse('session-1'),
    AgentExecutionIdSchema.parse('execution-1'),
  ),
  capabilityKey: 'analytics.readOverview',
  input: { period: 'week' },
  ...overrides,
});

describe('AgentSessionCapabilityInvocationService', () => {
  it('invokes only an exact active session graph after immutable policy recheck', async () => {
    const { service, controls, execute } = setup();

    await expect(service.invoke(input())).resolves.toMatchObject({
      outputSummary: { title: 'Inventory overview' },
    });

    expect(controls.isExecutionCapabilityAllowed).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sessionId: 'session-1',
      sessionTaskId: 'task-1',
      executionId: 'execution-1',
      capabilityKey: 'analytics.readOverview',
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      sessionId: 'session-1',
      sessionTaskId: 'task-1',
      executionId: 'execution-1',
      agentVersionId: 'version-1',
      policySnapshotId: 'policy-1',
      input: { period: 'week' },
    }));
  });

  it.each([
    ['missing execution', input({ execution: undefined })],
    ['wrong session', input({
      session: formatAgentSessionName(
        OrganizationIdSchema.parse('org-1'),
        AgentSessionIdSchema.parse('other-session'),
      ),
    })],
    ['archived session', input()],
    ['capability absent from the immutable policy', input()],
  ])('rejects %s without calling an owner adapter', async (label, invocation) => {
    const overrides =
      label === 'archived session'
        ? { runtimeContext: graph({ lifecycle: 'archived' }) }
        : label === 'capability absent from the immutable policy'
          ? { runtimeContext: graph({ capabilityKeys: [] }) }
          : {};
    const { service, execute } = setup(overrides);

    await expect(service.invoke(invocation as never)).rejects.toMatchObject({
      code: 'AGENT_EXECUTION_CAPABILITY_DENIED',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed for a missing registry handler, policy recheck failure, or mutation before approvals exist', async () => {
    const missing = setup();
    await expect(missing.service.invoke(input({ capabilityKey: 'unknown.read' }))).rejects.toMatchObject({
      code: 'AGENT_EXECUTION_CAPABILITY_DENIED',
    });

    const denied = setup({ allowed: false });
    await expect(denied.service.invoke(input())).rejects.toMatchObject({
      code: 'AGENT_EXECUTION_CAPABILITY_DENIED',
    });
    expect(denied.execute).not.toHaveBeenCalled();

    const mutation = setup({
      runtimeContext: graph({ capabilityKeys: ['supply.submitPurchaseOrder'] }),
    });
    mutation.capabilities.register({
      key: 'supply.submitPurchaseOrder',
      ownerDomain: 'supply',
      executionKind: 'tool',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      sideEffects: ['db_write'],
      approvalRisk: 'high',
      idempotencyKey: () => null,
      execute: vi.fn(),
    });
    await expect(mutation.service.invoke(input({ capabilityKey: 'supply.submitPurchaseOrder', input: {} }))).rejects.toMatchObject({
      code: 'AGENT_CAPABILITY_APPROVAL_REQUIRED',
    });
  });
});
