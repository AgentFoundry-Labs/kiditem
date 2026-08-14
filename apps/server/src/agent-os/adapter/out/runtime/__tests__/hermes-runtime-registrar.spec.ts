import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AgentRuntimeAdapterRegistry } from '../../../../application/service/agent-runtime-adapter.registry';
import { AgentCapabilityRegistry } from '../../../../application/service/agent-capability-registry.service';
import type { AgentCapabilityHandler } from '../../../../application/port/out/capability/agent-capability-handler.port';
import {
  HermesRuntimeStartupRegistrar,
  hermesRuntimeToolNameForCapability,
} from '../hermes-runtime-registrar';

const KEY = Buffer.alloc(32, 3).toString('base64');

function capability(): AgentCapabilityHandler {
  return {
    key: 'analytics.readOverview',
    ownerDomain: 'analytics',
    executionKind: 'tool',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({}).strict(),
    sideEffects: ['read'],
    approvalRisk: 'none',
    idempotencyKey: () => null,
    execute: async () => ({ outputSummary: {} }),
  };
}

describe('Hermes durable runtime registration', () => {
  it('uses one bounded MCP tool name per registered capability', () => {
    expect(
      hermesRuntimeToolNameForCapability('analytics.readOverview'),
    ).toBe('analytics_read_overview');
    expect(() => hermesRuntimeToolNameForCapability('123.invalid')).toThrow(
      'HERMES_RUNTIME_TOOL_NAME_INVALID',
    );
  });

  it('registers only an explicitly configured HTTP adapter after capability registration', async () => {
    const runtimes = new AgentRuntimeAdapterRegistry();
    const capabilities = new AgentCapabilityRegistry();
    capabilities.register(capability());
    const registrar = new HermesRuntimeStartupRegistrar(runtimes, capabilities, {
      HERMES_RUNTIME_BASE_URL: 'https://hermes.example/control/',
      AGENT_RUNTIME_CREDENTIAL_HMAC_KEY: 'test-secret-at-least-32-characters-long',
      AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY: KEY,
    });

    await registrar.onApplicationBootstrap();

    expect(runtimes.registeredTypes()).toEqual(['hermes_http']);
    expect(runtimes.requireCompatible('hermes_http', {
      detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true,
    }).runtimeType).toBe('hermes_http');
  });

  it('does not invent a Hermes runtime and fails closed for incomplete explicit configuration', async () => {
    const runtimes = new AgentRuntimeAdapterRegistry();
    const capabilities = new AgentCapabilityRegistry();
    await new HermesRuntimeStartupRegistrar(runtimes, capabilities, {}).onApplicationBootstrap();
    expect(runtimes.registeredTypes()).toEqual([]);

    await expect(new HermesRuntimeStartupRegistrar(runtimes, capabilities, {
      HERMES_RUNTIME_BASE_URL: 'https://hermes.example/control/',
    }).onApplicationBootstrap()).rejects.toThrow(
      'AGENT_RUNTIME_CREDENTIAL_HMAC_KEY_REQUIRED',
    );
  });
});
