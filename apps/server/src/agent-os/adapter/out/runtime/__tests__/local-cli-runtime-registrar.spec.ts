import { describe, expect, it, vi } from 'vitest';
import {
  LocalCliRuntimeStartupRegistrar,
  localCliMcpConfigForExecution,
} from '../local-cli-runtime-registrar';
import { AgentCapabilityRegistry } from '../../../../application/service/agent-capability-registry.service';
import { z } from 'zod';

describe('LocalCliRuntimeStartupRegistrar', () => {
  it('gives the parent CLI exactly the common controls and policy-registered low-risk names the MCP child can resolve', () => {
    const capabilities = new AgentCapabilityRegistry();
    capabilities.register({
      key: 'sourcing.refreshCollection',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: () => 'refresh:one',
      execute: async () => ({}),
    });
    capabilities.register({
      key: 'supply.submitPurchaseOrder',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      sideEffects: ['db_write'],
      approvalRisk: 'high',
      idempotencyKey: () => 'submit:one',
      execute: async () => ({}),
    });

    expect(localCliMcpConfigForExecution({
      agentDefinitionKey: 'sourcing',
      capabilityKeys: [
        'sourcing.refreshCollection',
        'supply.submitPurchaseOrder',
      ],
    }, capabilities.list())).toEqual({
      schemaVersion: 1,
      servers: [{
        key: 'kiditem',
        tools: [
          'agent_os_read_artifacts',
          'agent_os_read_context',
          'agent_os_read_task_graph',
          'sourcing_refresh_collection',
        ],
      }],
    });
  });

  it('fails startup rather than silently omitting an unavailable local CLI runtime', async () => {
    const ready = { runtimeType: 'claude_cli', assertReady: vi.fn().mockResolvedValue(undefined) };
    const unavailable = { runtimeType: 'codex_cli', assertReady: vi.fn().mockRejectedValue(new Error('ENOENT')) };
    const runtimes = { register: vi.fn() };
    const registrar = new LocalCliRuntimeStartupRegistrar(
      runtimes as never,
      {} as never,
      {
        AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY: 'h'.repeat(32),
      },
      () => [ready, unavailable] as never,
    );

    await expect(registrar.onApplicationBootstrap()).rejects.toThrow(
      'LOCAL_CLI_RUNTIME_UNAVAILABLE:codex_cli',
    );
    expect(runtimes.register).not.toHaveBeenCalled();
  });

  it('registers a ready local CLI without any KidItem credential or handle key', async () => {
    const ready = { runtimeType: 'codex_cli', assertReady: vi.fn().mockResolvedValue(undefined) };
    const factory = vi.fn(() => [ready] as never);
    const runtimes = { register: vi.fn() };
    const registrar = new LocalCliRuntimeStartupRegistrar(
      runtimes as never,
      {} as never,
      {},
      factory,
    );

    await registrar.onApplicationBootstrap();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(runtimes.register).toHaveBeenCalledWith(ready);
  });
});
