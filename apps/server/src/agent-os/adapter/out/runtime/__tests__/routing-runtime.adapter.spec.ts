import { describe, expect, it, vi } from 'vitest';
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
    agentType: 'rules_evaluation',
    requestId: 'req-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'default',
    adapterType: 'claude_local',
    model: 'claude-test',
    modelPlan: { primary: 'claude-test' },
    promptPath: 'agent-config/prompts/agents/rules-evaluation.md',
    conversationId: null,
    requestedByUserId: null,
    playbookKey: null,
    planStepKey: null,
    skillKeys: [],
    outputSchemaPath: null,
    input: { ruleSetId: 'rules-1' },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

describe('RoutingRuntimeAdapter', () => {
  it('delegates to the registered handler when one matches the agentType', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const expected: AgentRuntimeResult = {
      output: { ok: true, sample: 'rules' },
      provider: 'claude-local',
    };
    const handler = { execute: vi.fn().mockResolvedValue(expected) };
    registry.register('rules_evaluation', handler);
    const adapter = new RoutingRuntimeAdapter(registry);

    const result = await adapter.execute(makeContext());
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect(result).toBe(expected);
  });

  it('routes Claude and Codex CLI adapters through the generic local runtime', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const localRuntime = {
      execute: vi.fn().mockResolvedValue({ output: { text: 'answer' } }),
      cancel: vi.fn().mockResolvedValue(true),
    };
    const adapter = new RoutingRuntimeAdapter(registry, localRuntime as never);
    const context = makeContext({
      agentType: 'sourcing',
      adapterType: 'codex_cli',
      conversationId: 'conversation-1',
    });

    await expect(adapter.execute(context)).resolves.toEqual({
      output: { text: 'answer' },
    });
    expect(localRuntime.execute).toHaveBeenCalledWith(context);
    await expect(
      adapter.cancel({
        organizationId: 'org-1',
        requestId: 'req-1',
        runId: 'run-1',
        reason: 'user_cancelled',
      }),
    ).resolves.toBe(true);
  });

  it('uses a supporting deterministic handler before a local CLI adapter', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const handler = {
      supports: vi.fn().mockReturnValue(true),
      execute: vi
        .fn()
        .mockResolvedValue({ output: { candidateId: 'candidate-1' } }),
    };
    registry.register('sourcing', handler);
    const localRuntime = { execute: vi.fn() };
    const adapter = new RoutingRuntimeAdapter(registry, localRuntime as never);
    const context = makeContext({
      agentType: 'sourcing',
      adapterType: 'codex_cli',
      input: { action: 'scrape_url' },
    });

    await expect(adapter.execute(context)).resolves.toEqual({
      output: { candidateId: 'candidate-1' },
    });
    expect(handler.execute).toHaveBeenCalledWith(context);
    expect(localRuntime.execute).not.toHaveBeenCalled();
  });

  it('falls through an unsupported owner handler to the configured local CLI', async () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const handler = {
      supports: vi.fn().mockReturnValue(false),
      execute: vi.fn(),
    };
    registry.register('sourcing', handler);
    const localRuntime = {
      execute: vi
        .fn()
        .mockResolvedValue({ output: { answer: '근거 기반 답변' } }),
    };
    const adapter = new RoutingRuntimeAdapter(registry, localRuntime as never);
    const context = makeContext({
      agentType: 'sourcing',
      adapterType: 'codex_cli',
      input: { action: 'market_research' },
    });

    await expect(adapter.execute(context)).resolves.toEqual({
      output: { answer: '근거 기반 답변' },
    });
    expect(handler.execute).not.toHaveBeenCalled();
    expect(localRuntime.execute).toHaveBeenCalledWith(context);
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

  it('does not enable a production no-op path from environment input', async () => {
    process.env.AGENT_RUNTIME_ALLOW_NOOP = '1';
    try {
      const registry = new AgentRuntimeHandlerRegistry();
      const adapter = new RoutingRuntimeAdapter(registry);
      await expect(adapter.execute(makeContext())).rejects.toMatchObject({
        code: 'runtime_not_configured',
      });
    } finally {
      delete process.env.AGENT_RUNTIME_ALLOW_NOOP;
    }
  });
});
