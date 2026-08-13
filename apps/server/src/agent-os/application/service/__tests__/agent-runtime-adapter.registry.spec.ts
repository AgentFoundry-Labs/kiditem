import { describe, expect, it } from 'vitest';
import type {
  AgentDurableRuntimeAdapter,
  AgentDurableRuntimeCapabilities,
} from '../../port/out/runtime/agent-durable-runtime.port';
import { AgentRuntimeAdapterRegistry } from '../agent-runtime-adapter.registry';

const capabilities: AgentDurableRuntimeCapabilities = {
  detached: true,
  reconnect: true,
  interrupt: true,
  cancel: true,
  inspect: true,
};

function adapter(
  runtimeType: string,
  overrides: Partial<AgentDurableRuntimeCapabilities> = {},
): AgentDurableRuntimeAdapter {
  return {
    runtimeType,
    capabilities: { ...capabilities, ...overrides },
    async start() {
      throw new Error('unused');
    },
    async *connect() {
      return;
    },
    async inspect() {
      return { status: 'running' };
    },
    async interrupt() {},
    async cancel() {},
  };
}

describe('AgentRuntimeAdapterRegistry', () => {
  it('requires the exact registered runtime and every declared capability', () => {
    const registry = new AgentRuntimeAdapterRegistry();
    const hermes = adapter('hermes_http');
    registry.register(hermes);

    expect(registry.requireCompatible('hermes_http', capabilities)).toBe(hermes);
    expect(() => registry.requireCompatible('openai_responses', capabilities)).toThrow(
      /AGENT_RUNTIME_NOT_CONFIGURED/,
    );
    expect(() =>
      new AgentRuntimeAdapterRegistry().register(
        adapter('hermes_http', { reconnect: false }),
      ),
    ).not.toThrow();
  });

  it('rejects duplicate runtime registration and has no fallback resolver', () => {
    const registry = new AgentRuntimeAdapterRegistry();
    registry.register(adapter('hermes_http'));

    expect(() => registry.register(adapter('hermes_http'))).toThrow(
      /already registered/,
    );
    expect(registry).not.toHaveProperty('resolveFallback');
  });

  it('reports each missing durable capability', () => {
    const registry = new AgentRuntimeAdapterRegistry();
    registry.register(adapter('limited', { reconnect: false, inspect: false }));

    expect(() => registry.requireCompatible('limited', capabilities)).toThrow(
      /reconnect.*inspect/,
    );
  });
});
