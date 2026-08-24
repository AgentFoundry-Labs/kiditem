import { describe, expect, it } from 'vitest';
import { AttemptExecutor } from './attempt-executor';
import { AttemptProcessRegistry } from './attempt-process.registry';
import type { ProcessCallbacks, SupervisedProcess } from '../platform/process-supervisor';

const launch = { attemptId: '33333333-3333-4333-8333-333333333333', runtime: 'claude_cli' as const, model: 'claude-sonnet', prompt: 'prompt must not leak', timeoutMs: 10_000, workspacePolicy: 'empty_ephemeral_v1' as const, mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/attempts/33333333-3333-4333-8333-333333333333/mcp', attemptToken: 'A'.repeat(43), mcpProtocolRevision: '2026-07-28' as const, cliContractIdentity: 'office-cli-contract-v2' as const };

describe('AttemptExecutor', () => {
  it('runs a provider only through its workspace/supervisor and emits bounded safe terminal events', async () => {
    const events: unknown[] = []; let command: unknown; const token = launch.attemptToken;
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => undefined },
      supervisor: { launch: async (received, callbacks) => { command = received; callbacks?.onStderr?.(`raw provider stderr ${token}`); return { terminate: async () => undefined, input: async () => undefined, onExit: () => undefined }; }, shutdown: async () => undefined },
      emit: (event) => events.push(event),
    });
    await executor.start(launch);

    expect(JSON.stringify(command)).not.toContain(launch.prompt);
    expect(JSON.stringify(events)).not.toContain(launch.attemptToken);
    expect(JSON.stringify(events)).not.toContain('stderr');
    expect(events).toEqual([]);
  });

  it('cleans up the registered process, timeout, and workspace when initial provider input fails', async () => {
    let removals = 0; let terminations = 0;
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: { launch: async () => processHandle({ input: async () => { throw new Error('initial_provider_input_failed'); }, terminate: async () => { terminations += 1; } }), shutdown: async () => undefined },
      emit: () => undefined,
    });

    await expect(executor.start(launch)).rejects.toThrow('initial_provider_input_failed');
    await expect(executor.input(launch.attemptId, 'continue')).rejects.toThrow('runner_attempt_not_live');
    expect(terminations).toBe(1);
    expect(removals).toBe(1);
  });

  it('rejects and cleans up a pending Codex start when app-server exits after an RPC write but before its reply', async () => {
    let callbacks: ProcessCallbacks | undefined; let removals = 0; let terminations = 0;
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: {
        launch: async (_command, received) => {
          callbacks = received;
          return processHandle({
            input: async (line) => {
              if ((JSON.parse(line) as { method?: string }).method === 'initialize') callbacks?.onExit?.({ code: 1, signal: null });
            },
            terminate: async () => { terminations += 1; },
          });
        },
        shutdown: async () => undefined,
      },
      emit: () => undefined,
    });

    await expect(executor.start({ ...launch, runtime: 'codex_cli' })).rejects.toThrow('codex_app_server_closed');
    await expect(executor.input(launch.attemptId, 'continue')).rejects.toThrow('runner_attempt_not_live');
    expect(terminations).toBe(1);
    expect(removals).toBe(1);
  });

  it('does not miss an immediate provider exit before active-state installation', async () => {
    const events: unknown[] = []; let removals = 0; let inputs = 0;
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: {
        launch: async (_command, callbacks) => {
          callbacks?.onExit?.({ code: 0, signal: null });
          return processHandle({ input: async () => { inputs += 1; } });
        },
        shutdown: async () => undefined,
      },
      emit: (event) => events.push(event),
    });

    await expect(executor.start(launch)).rejects.toThrow('runner_provider_exited_during_start');
    await settle();

    expect(inputs).toBe(0);
    expect(events).toEqual([]);
    expect(removals).toBe(1);
  });

  it('uses exact Codex completion notifications for bounded output, structured result, and app-server termination', async () => {
    const events: unknown[] = []; let callbacks: ProcessCallbacks | undefined; let terminations = 0; let removals = 0;
    const writes: string[] = [];
    const process = processHandle({
      input: async (line) => {
        writes.push(line);
        const request = JSON.parse(line) as { id?: string; method?: string };
        if (!request.id || !request.method) return;
        const result = request.method === 'initialize' ? {}
          : request.method === 'thread/start' ? { thread: { id: 'thread-1' }, activePermissionProfile: { id: ':workspace' } }
            : request.method === 'turn/start' ? { turn: { id: 'turn-1' } } : {};
        callbacks?.onStdout?.(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
      },
      terminate: async () => { terminations += 1; },
    });
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: { launch: async (_command, received) => { callbacks = received; return process; }, shutdown: async () => undefined },
      emit: (event) => events.push(event),
    });

    await executor.start({ ...launch, runtime: 'codex_cli' });
    callbacks?.onStdout?.(`${JSON.stringify({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: `safe ${launch.attemptToken}` } })}\n`);
    callbacks?.onStdout?.(`${JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [{ type: 'agentMessage', id: 'item-1', text: JSON.stringify({ outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] }) }] } } })}\n`);
    await settle();

    expect(events).toContainEqual({ kind: 'attempt.output', attemptId: launch.attemptId, output: 'safe [redacted]' });
    expect(events).toContainEqual({ kind: 'attempt.terminal', attemptId: launch.attemptId, terminalReason: 'protocol_success', result: { outcome: 'completed', summary: 'done', resourceRefs: [], operationRefs: [] } });
    expect(terminations).toBe(1);
    expect(removals).toBe(1);
    expect(JSON.stringify(events)).not.toContain(launch.attemptToken);
    expect(writes.map((line) => JSON.parse(line).method)).not.toContain('turn/steer');
  });

  it('retains the workspace and reports no terminal state when complete-tree termination fails', async () => {
    let removals = 0; const events: unknown[] = [];
    const registry = new AttemptProcessRegistry();
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: { launch: async () => processHandle({ terminate: async () => { throw new Error('tree_termination_failed'); } }), shutdown: async () => undefined },
      emit: (event) => events.push(event),
      registry,
    });
    await executor.start(launch);

    await expect(executor.interrupt(launch.attemptId)).rejects.toThrow('tree_termination_failed');
    await expect(executor.input(launch.attemptId, 'continue')).rejects.toThrow('runner_attempt_not_live');
    expect(removals).toBe(0);
    expect(events).toEqual([]);
    expect(registry.get(launch.attemptId)).not.toBeNull();
  });

  it('fails closed instead of treating a failed-start descendant tree as an installed retry', async () => {
    let removals = 0;
    const registry = new AttemptProcessRegistry();
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: {
        launch: async () => processHandle({
          input: async () => { throw new Error('initial_provider_input_failed'); },
          terminate: async () => { throw new Error('tree_termination_failed'); },
        }),
        shutdown: async () => undefined,
      },
      emit: () => undefined,
      registry,
    });

    await expect(executor.start(launch)).rejects.toThrow('runner_attempt_start_cleanup_failed');
    await expect(executor.start(launch)).rejects.toThrow('tree_termination_failed');
    expect(removals).toBe(0);
    expect(registry.get(launch.attemptId)).not.toBeNull();
  });

  it('waits for one terminalization before removing the workspace when interrupt races arrive together', async () => {
    let terminated = 0; let removals = 0; const events: unknown[] = [];
    let confirmTreeDeath!: () => void;
    const treeDeath = new Promise<void>((resolve) => { confirmTreeDeath = resolve; });
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: { launch: async () => processHandle({ terminate: async () => { terminated += 1; await treeDeath; } }), shutdown: async () => undefined },
      emit: (event) => events.push(event),
    });
    await executor.start(launch);

    const first = executor.interrupt(launch.attemptId);
    const second = executor.interrupt(launch.attemptId);
    let secondSettled = false;
    void second.then(() => { secondSettled = true; });
    await Promise.resolve();

    expect(terminated).toBe(1);
    expect(secondSettled).toBe(false);
    expect(removals).toBe(0);
    expect(events).toEqual([]);

    confirmTreeDeath();
    await Promise.all([first, second]);

    expect(removals).toBe(1);
    expect(events).toEqual([{ kind: 'attempt.terminal', attemptId: launch.attemptId, terminalReason: 'interrupted' }]);
  });

  it('attempts runner kill-all after a tree termination failure and surfaces the aggregate', async () => {
    let removals = 0; let killAll = 0; let terminations = 0;
    const executor = new AttemptExecutor({
      runtimeRoot: '/opt/kiditem-runner',
      workspaces: { create: async () => paths, linkProviderAuth: async () => undefined, remove: async () => { removals += 1; } },
      supervisor: {
        launch: async () => processHandle({ terminate: async () => { terminations += 1; throw new Error('tree_termination_failed'); } }),
        shutdown: async () => { killAll += 1; throw new Error('runner_kill_all_failed'); },
      },
      emit: () => undefined,
    });
    await executor.start(launch);

    await expect(executor.shutdown()).rejects.toSatisfy((error: unknown) => (
      error instanceof AggregateError && error.errors.some((entry) => entry instanceof Error && entry.message === 'tree_termination_failed') &&
      error.errors.some((entry) => entry instanceof Error && entry.message === 'runner_kill_all_failed')
    ));
    expect(terminations).toBeGreaterThanOrEqual(1);
    expect(killAll).toBe(1);
    expect(removals).toBe(0);
  });
});
const paths = { root: '/tmp/a', workspace: '/tmp/a/workspace', home: '/tmp/a/home', codexHome: '/tmp/a/codex', claudeConfigDir: '/tmp/a/claude', mcpConfigPath: '/tmp/a/mcp.json', codexConfigPath: '/tmp/a/codex.toml' };

function processHandle(input: Partial<SupervisedProcess> = {}): SupervisedProcess {
  return {
    input: input.input ?? (async () => undefined),
    terminate: input.terminate ?? (async () => undefined),
    onExit: input.onExit ?? (() => undefined),
  };
}

async function settle(): Promise<void> { await Promise.resolve(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
