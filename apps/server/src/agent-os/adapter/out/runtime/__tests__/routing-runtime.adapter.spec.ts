import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutingRuntimeAdapter } from '../routing-runtime.adapter';
import { AgentRuntimeHandlerRegistry } from '../../../../application/service/agent-runtime-handler-registry.service';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../application/port/out/runtime/agent-runtime.port';

function makeContext(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'instance-1',
    agentType: 'detail_page_generate',
    requestId: 'req-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'default',
    adapterType: 'claude_local',
    model: 'gemini-test',
    promptPath: 'agent-config/prompts/agents/detail-page-generate.md',
    input: { templateId: 'bold-vertical' },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

describe('RoutingRuntimeAdapter', () => {
  const previousNoop = process.env.AGENT_RUNTIME_ALLOW_NOOP;

  beforeEach(() => {
    delete process.env.AGENT_RUNTIME_ALLOW_NOOP;
  });

  afterEach(() => {
    if (previousNoop === undefined) {
      delete process.env.AGENT_RUNTIME_ALLOW_NOOP;
    } else {
      process.env.AGENT_RUNTIME_ALLOW_NOOP = previousNoop;
    }
  });

  it('delegates to the registered handler when one matches the agentType', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const expected: AgentRuntimeResult = {
      output: { ok: true, sample: 'detail-page' },
      provider: 'gemini-text',
    };
    const handler = { execute: vi.fn().mockResolvedValue(expected) };
    registry.register('detail_page_generate', handler);
    const adapter = new RoutingRuntimeAdapter(registry);

    const result = await adapter.execute(makeContext());
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect(result).toBe(expected);
  });

  it('throws runtime_not_configured when no handler is registered (default mode)', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const adapter = new RoutingRuntimeAdapter(registry);

    await expect(adapter.execute(makeContext())).rejects.toBeInstanceOf(
      AgentOsRuntimeError,
    );
    await expect(adapter.execute(makeContext())).rejects.toMatchObject({
      code: 'runtime_not_configured',
    });
  });

  it('returns a synthetic stub when AGENT_RUNTIME_ALLOW_NOOP=1 and no handler exists', async () => {
    process.env.AGENT_RUNTIME_ALLOW_NOOP = '1';
    const registry = new AgentRuntimeHandlerRegistry();
    const adapter = new RoutingRuntimeAdapter(registry);

    const result = await adapter.execute(makeContext());
    expect(result.provider).toBe('local-stub');
    expect(result.output).toEqual(
      expect.objectContaining({ ok: true, agentType: 'detail_page_generate' }),
    );
  });

  it('prefers the registered handler over the noop stub even when ALLOW_NOOP is set', async () => {
    process.env.AGENT_RUNTIME_ALLOW_NOOP = '1';
    const registry = new AgentRuntimeHandlerRegistry();
    const handler = {
      execute: vi.fn().mockResolvedValue({ output: { real: true } } as AgentRuntimeResult),
    };
    registry.register('detail_page_generate', handler);
    const adapter = new RoutingRuntimeAdapter(registry);

    const result = await adapter.execute(makeContext());
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ real: true });
  });
});
