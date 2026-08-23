import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptProcessRegistry } from './agent-attempt-process-registry';
import { AgentAttemptExecutorService } from './agent-attempt-executor.service';
import type { AttemptFilesystemPaths } from './attempt-filesystem.service';
import { buildClaudeAttemptCommand } from './claude-attempt.adapter';
import { buildCodexAttemptCommand } from './codex-attempt.adapter';
import { AttemptLiveControlRegistry } from './attempt-live-control.registry';

describe('ephemeral AgentAttempt CLI runtime', () => {
  it('builds ephemeral Codex and non-persistent strict Claude invocations from an explicit model', () => {
    const profile = { model: 'test-model', loginHome: '/provider-login' };
    const codex = buildCodexAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', profile });
    const claude = buildClaudeAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', profile });
    expect(codex.args).toEqual(expect.arrayContaining(['--ephemeral', '--ignore-user-config']));
    expect(claude.args).toEqual(expect.arrayContaining(['--no-session-persistence', '--strict-mcp-config']));
    expect([...codex.args, ...claude.args]).not.toContain('--max-budget-usd');
    expect(codex.env).toEqual({ PATH: expect.any(String), HOME: '/provider-login', ATTEMPT_MCP_SOCKET_PATH: '/tmp/broker.sock' });
    expect(() => buildCodexAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', profile: { ...profile, model: '' } })).toThrow('missing_runtime_model');
  });

  it('keeps second-message and interrupt handles only for the live Attempt', async () => {
    const registry = new AttemptLiveControlRegistry();
    const sent: string[] = [];
    let interrupted = false;
    registry.register('attempt-1', { send: async (message) => { sent.push(message); }, interrupt: async () => { interrupted = true; } });
    await registry.get('attempt-1')!.send('second message');
    await registry.get('attempt-1')!.interrupt();
    registry.remove('attempt-1');
    expect(sent).toEqual(['second message']);
    expect(interrupted).toBe(true);
    expect(registry.get('attempt-1')).toBeNull();
  });

  it('terminates only the owned Attempt process group with bounded escalation', async () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const child = new EventEmitter() as ChildProcessWithoutNullStreams;
    Object.assign(child, { pid: 7331, exitCode: null });
    child.on('exit', () => { Object.assign(child, { exitCode: 0 }); });
    const registry = new AgentAttemptProcessRegistry();
    registry.register('attempt-1', child);
    const ending = registry.terminate('attempt-1', 1);
    child.emit('exit', 0);
    await ending;
    expect(processKill).toHaveBeenCalledWith(-7331, 'SIGTERM');
    expect(registry.get('attempt-1')).toBeNull();
    processKill.mockRestore();
  });

  it('owns the spawned group and removes broker, controls, and files when the CLI exits', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt', workspace: '/tmp/attempt/workspace', broker: '/tmp/attempt/broker', socketPath: '/tmp/attempt/broker/attempt.sock' };
    const files = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined) };
    const broker = { listen: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const child = fakeChild(7444);
    const spawner = vi.fn(() => child);
    const processes = new AgentAttemptProcessRegistry();
    const controls = new AttemptLiveControlRegistry();
    const executor = new AgentAttemptExecutorService(files as never, processes, controls, broker as never, spawner as never, 60_000);

    await executor.start(attemptInput());
    expect(spawner).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({ detached: true, shell: false }));
    expect(broker.listen).toHaveBeenCalledWith(expect.objectContaining({ socketPath: paths.socketPath, processGroupId: 7444, attemptId: 'attempt-1' }));
    expect(controls.get('attempt-1')).not.toBeNull();
    child.emit('exit', 0);
    await vi.waitFor(() => expect(files.remove).toHaveBeenCalledWith(paths));
    expect(broker.close).toHaveBeenCalledWith(paths.socketPath);
    expect(controls.get('attempt-1')).toBeNull();
    expect(processes.get('attempt-1')).toBeNull();
  });

  it('cleans allocated files for synchronous spawn failures and emitted process errors', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-error', workspace: '/tmp/attempt-error/workspace', broker: '/tmp/attempt-error/broker', socketPath: '/tmp/attempt-error/broker/attempt.sock' };
    const failedFiles = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined) };
    const failedExecutor = new AgentAttemptExecutorService(failedFiles as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => { throw new Error('spawn_failed'); }) as never);
    await expect(failedExecutor.start(attemptInput())).rejects.toThrow('spawn_failed');
    expect(failedFiles.remove).toHaveBeenCalledWith(paths);

    const files = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined) };
    const broker = { listen: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const child = fakeChild(7555);
    child.once('error', () => { Object.assign(child, { exitCode: 1 }); });
    const executor = new AgentAttemptExecutorService(files as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), broker as never, (() => child) as never, 60_000);
    await executor.start(attemptInput());
    child.emit('error', new Error('cli_failed'));
    await vi.waitFor(() => expect(files.remove).toHaveBeenCalledWith(paths));
    expect(broker.close).toHaveBeenCalledWith(paths.socketPath);
  });

  it('requires the current AgentVersion to admit the Task-pinned runtime before allocating files', async () => {
    const files = { create: vi.fn(), remove: vi.fn() };
    const admission = { assert: vi.fn(async () => { throw new Error('attempt_runtime_not_pinned'); }) };
    const executor = new AgentAttemptExecutorService(files as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, undefined, undefined, admission);
    await expect(executor.start(attemptInput())).rejects.toThrow('attempt_runtime_not_pinned');
    expect(admission.assert).toHaveBeenCalledWith('version', 'codex_cli');
    expect(files.create).not.toHaveBeenCalled();
  });
});

function fakeChild(pid: number): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(child, {
    pid,
    exitCode: null,
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  return child;
}

function attemptInput() {
  return {
    attemptId: 'attempt-1', runtime: 'codex_cli' as const, prompt: 'collect signals',
    profile: { model: 'test-model', loginHome: '/provider-login' },
    mcp: { attemptId: 'attempt-1', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', capabilityKeys: ['sourcing.collect_shadow_signals'] },
  };
}
