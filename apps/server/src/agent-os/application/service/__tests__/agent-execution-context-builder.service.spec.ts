import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentExecutionContextBuilder } from '../agent-execution-context-builder.service';

const userEvent = {
  externalEventId: 'user-event-1',
  schemaVersion: 1 as const,
  payload: { phase: 'complete' as const, messageId: 'user-event-1', content: 'canonical request' },
};
const currentInput = {
  dashboardContext: {
    routeKey: 'dashboard',
    resourceRefs: [{ kind: 'product', id: 'product-1', version: '7' }],
    filters: {}, visibleRowIds: [], aggregateSummary: {}, locale: 'ko-KR', timezone: 'Asia/Seoul',
  },
  userEvent,
};
const manifest = {
  schemaVersion: 1 as const,
  agentDefinitionKey: 'operator',
  runtimeKind: 'coordinator' as const,
  runtimeType: 'hermes_http',
  modelIdentity: 'gpt-test',
  capabilityKeys: ['analytics.readOverview', 'supply.submit_purchase_order'],
  policyDocument: {},
  delegation: {
    role: 'orchestrator' as const,
    allowedAgentDefinitionKeys: ['sourcing'], maxDepth: 2, maxChildrenPerTask: 5,
  },
  limits: { maxTurns: 40, maxContextTokens: 32_000, summaryTargetTokens: 1_024 },
  assets: {
    prompt: { path: 'agent-config/prompts/agents/manager.md', sha256: 'a'.repeat(64) },
    summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'b'.repeat(64) },
    skills: [], outputSchema: null,
  },
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
}

function graph(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1', sessionId: 'session-1', sessionLifecycle: 'active',
    sessionTaskId: 'task-1', taskStatus: 'running', executionId: 'execution-1',
    attemptId: 'attempt-1', agentVersionId: 'version-1', agentDefinitionKey: 'operator',
    runtimeType: 'hermes_http', modelIdentity: 'gpt-test', policySnapshotId: 'policy-1',
    versionManifest: manifest, policyCapabilityKeys: ['analytics.readOverview'],
    inputHash: createHash('sha256').update(canonicalJson(currentInput)).digest('hex'),
    currentInput, currentResourceRefs: currentInput.dashboardContext.resourceRefs,
    currentUserEvent: { externalEventId: userEvent.externalEventId, sequence: 1n, eventType: 'user_message', schemaVersion: 1, payload: userEvent.payload },
    ...overrides,
  };
}

describe('AgentExecutionContextBuilder', () => {
  it('rebuilds capabilities only from immutable version intersected with policy and registry', async () => {
    const repository = { loadExecutionGraph: vi.fn().mockResolvedValue(graph()) };
    const modelView = { build: vi.fn().mockResolvedValue({ throughSequence: '1', summary: null, turns: [{ role: 'user', content: 'canonical request', throughSequence: '1' }] }) };
    const assets = { resolve: vi.fn().mockResolvedValue({ prompt: 'prompt', promptSha256: 'a'.repeat(64), summaryPrompt: 'summary', summaryPromptSha256: 'b'.repeat(64), skills: [], outputSchema: null }) };
    const capabilities = new AgentCapabilityRegistry();
    capabilities.register({ key: 'analytics.readOverview' } as never);
    const builder = new AgentExecutionContextBuilder(repository as never, modelView as never, assets as never, capabilities);

    const context = await builder.build({
      organizationId: 'org-1', sessionId: 'session-1', sessionTaskId: 'task-1',
      executionId: 'execution-1', attemptId: 'attempt-1',
    });

    expect(context.capabilityKeys).toEqual(['analytics.readOverview']);
    expect(context.currentInput).toEqual(currentInput);
    expect(JSON.stringify(context)).not.toContain('supply.submit_purchase_order');
  });

  it('rejects a forged current input or mismatched canonical user event', async () => {
    const repository = { loadExecutionGraph: vi.fn().mockResolvedValue(graph({ inputHash: '0'.repeat(64) })) };
    const builder = new AgentExecutionContextBuilder(repository as never, { build: vi.fn() } as never, { resolve: vi.fn() } as never, new AgentCapabilityRegistry());
    await expect(builder.build({ organizationId: 'org-1', sessionId: 'session-1', sessionTaskId: 'task-1', executionId: 'execution-1', attemptId: 'attempt-1' }))
      .rejects.toMatchObject({ code: 'AGENT_EXECUTION_INPUT_MISMATCH' });
  });

  it('rejects a current input event envelope whose schema identity is not exact', async () => {
    const invalidInput = {
      ...currentInput,
      userEvent: { ...currentInput.userEvent, schemaVersion: 2 },
    };
    const repository = {
      loadExecutionGraph: vi.fn().mockResolvedValue(graph({
        currentInput: invalidInput,
        inputHash: createHash('sha256')
          .update(canonicalJson(invalidInput))
          .digest('hex'),
      })),
    };
    const builder = new AgentExecutionContextBuilder(
      repository as never,
      { build: vi.fn() } as never,
      { resolve: vi.fn() } as never,
      new AgentCapabilityRegistry(),
    );
    await expect(builder.build({
      organizationId: 'org-1', sessionId: 'session-1', sessionTaskId: 'task-1',
      executionId: 'execution-1', attemptId: 'attempt-1',
    })).rejects.toMatchObject({ code: 'AGENT_EXECUTION_INPUT_MISMATCH' });
  });

  it('rejects a cross-scope, archived, or mismatched exact graph', async () => {
    const repository = { loadExecutionGraph: vi.fn().mockResolvedValue(graph({ sessionLifecycle: 'archived' })) };
    const builder = new AgentExecutionContextBuilder(repository as never, { build: vi.fn() } as never, { resolve: vi.fn() } as never, new AgentCapabilityRegistry());
    await expect(builder.build({ organizationId: 'org-1', sessionId: 'session-1', sessionTaskId: 'task-1', executionId: 'execution-1', attemptId: 'attempt-1' }))
      .rejects.toMatchObject({ code: 'AGENT_EXECUTION_CONTEXT_INVALID' });
  });
});
