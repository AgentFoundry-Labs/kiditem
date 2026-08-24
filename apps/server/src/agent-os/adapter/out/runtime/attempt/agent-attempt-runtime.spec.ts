import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptProcessRegistry } from './agent-attempt-process-registry';
import { AgentAttemptExecutorService, resolveInstructionProfilePath } from './agent-attempt-executor.service';
import type { AttemptFilesystemPaths } from './attempt-filesystem.service';
import { buildClaudeAttemptCommand } from './claude-attempt.adapter';
import { buildCodexAttemptCommand } from './codex-attempt.adapter';
import { AttemptLiveControlRegistry } from './attempt-live-control.registry';

describe('ephemeral AgentAttempt CLI runtime', () => {
  it('resolves an image-style server working directory to the copied root instruction profile', async () => {
    await expect(resolveInstructionProfilePath('agent-config/prompts/agents/operator.md', process.cwd()))
      .resolves.toMatch(/agent-config\/prompts\/agents\/operator\.md$/);
    await expect(resolveInstructionProfilePath('../secret.md', process.cwd())).rejects.toThrow('attempt_instruction_profile_invalid');
  });

  it('builds strict live Codex app-server and non-persistent Claude MCP invocations from an explicit model', () => {
    const profile = { model: 'test-model', loginHome: '/provider-login', home: '/attempt/home', codexHome: '/attempt/codex', claudeConfigDir: '/attempt/claude' };
    const codex = buildCodexAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', mcpConfigPath: '/tmp/mcp.json', profile });
    const claude = buildClaudeAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', mcpConfigPath: '/tmp/mcp.json', profile });
    expect(codex.args).toEqual(expect.arrayContaining([
      'app-server', '--stdio', '--strict-config', 'history.persistence="none"',
      'tools.web_search=false',
    ]));
    expect(claude.args).toEqual(expect.arrayContaining(['--input-format', 'stream-json', '--output-format', 'stream-json', '--no-session-persistence', '--mcp-config', '/tmp/mcp.json', '--strict-mcp-config', '--tools', 'Agent']));
    expect([...codex.args, ...claude.args]).not.toContain('--max-budget-usd');
    expect(codex.env).toEqual({ PATH: expect.any(String), HOME: '/attempt/home', CODEX_HOME: '/attempt/codex', ATTEMPT_MCP_SOCKET_PATH: '/tmp/broker.sock' });
    expect(claude.env).toEqual({ PATH: expect.any(String), HOME: '/attempt/home', CLAUDE_CONFIG_DIR: '/attempt/claude' });
    expect(() => buildCodexAttemptCommand({ workspace: '/tmp/work', socketPath: '/tmp/broker.sock', mcpConfigPath: '/tmp/mcp.json', profile: { ...profile, model: '' } })).toThrow('missing_runtime_model');
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
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt', workspace: '/tmp/attempt/workspace', broker: '/tmp/attempt/broker', socketPath: '/tmp/attempt/broker/attempt.sock', mcpConfigPath: '/tmp/attempt/broker/mcp.json' };
    const files = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) };
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
    child.once('exit', () => { Object.assign(child, { exitCode: 0 }); });
    child.emit('exit', 0);
    child.stdout.emit('close');
    await vi.waitFor(() => expect(files.remove).toHaveBeenCalledWith(paths));
    expect(broker.close).toHaveBeenCalledWith(paths.socketPath);
    expect(controls.get('attempt-1')).toBeNull();
    expect(processes.get('attempt-1')).toBeNull();
  });

  it('cleans allocated files for synchronous spawn failures and emitted process errors', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-error', workspace: '/tmp/attempt-error/workspace', broker: '/tmp/attempt-error/broker', socketPath: '/tmp/attempt-error/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-error/broker/mcp.json' };
    const failedFiles = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) };
    const failedExecutor = new AgentAttemptExecutorService(failedFiles as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => { throw new Error('spawn_failed'); }) as never);
    await expect(failedExecutor.start(attemptInput())).rejects.toThrow('spawn_failed');
    expect(failedFiles.remove).toHaveBeenCalledWith(paths);

    const files = { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) };
    const broker = { listen: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const child = fakeChild(7555);
    child.once('error', () => { Object.assign(child, { exitCode: 1 }); });
    const executor = new AgentAttemptExecutorService(files as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), broker as never, (() => child) as never, 60_000);
    await executor.start(attemptInput());
    child.emit('error', new Error('cli_failed'));
    await vi.waitFor(() => expect(files.remove).toHaveBeenCalledWith(paths));
    expect(broker.close).toHaveBeenCalledWith(paths.socketPath);
  });

  it('uses app-server and stream-json envelopes without closing the live stdin', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-protocol', workspace: '/tmp/attempt-protocol/workspace', broker: '/tmp/attempt-protocol/broker', socketPath: '/tmp/attempt-protocol/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-protocol/broker/mcp.json' };
    const codex = fakeChild(7666);
    const terminal = vi.fn(async () => undefined);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => codex) as never, 60_000, undefined, { running: vi.fn(async () => undefined), terminal, release: vi.fn() });
    await executor.start(attemptInput());
    expect(codex.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"method":"initialize"'));
    expect(codex.stdin.end).not.toHaveBeenCalled();
    codex.once('exit', () => { Object.assign(codex, { exitCode: 7 }); });
    codex.emit('exit', 7);
    codex.stdout.emit('close');
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledWith('attempt-1', 'failed', expect.objectContaining({ code: 'attempt_exit_nonzero' }), undefined));

    const claude = fakeChild(7667);
    const claudeExecutor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => claude) as never);
    await claudeExecutor.start({ ...attemptInput(), attemptId: 'attempt-claude', runtime: 'claude_cli' });
    expect(claude.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"type":"user"'));
    expect(claude.stdin.end).not.toHaveBeenCalled();
  });

  it('terminalizes provider protocol completion and terminates the app-server group', async () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-terminal', workspace: '/tmp/attempt-terminal/workspace', broker: '/tmp/attempt-terminal/broker', socketPath: '/tmp/attempt-terminal/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-terminal/broker/mcp.json' };
    const child = fakeChild(7677);
    child.once('exit', () => { Object.assign(child, { exitCode: 0 }); });
    const terminal = vi.fn(async () => undefined);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never, 60_000, undefined, { running: vi.fn(async () => undefined), terminal, release: vi.fn() });
    await executor.start(attemptInput());
    child.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify(durableResult('durable answer')) }] } } }) + '\n'));
    child.emit('exit', 0);
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledWith('attempt-1', 'succeeded', undefined, expect.objectContaining({ summary: 'durable answer' })));
    expect(processKill).toHaveBeenCalledWith(-7677, 'SIGTERM');
    processKill.mockRestore();
  });

  it('drains stdout that arrives after exit before terminalizing exactly once', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-drain', workspace: '/tmp/attempt-drain/workspace', broker: '/tmp/attempt-drain/broker', socketPath: '/tmp/attempt-drain/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-drain/broker/mcp.json' };
    const child = fakeChild(76771);
    child.once('exit', () => { Object.assign(child, { exitCode: 0 }); });
    const terminal = vi.fn(async () => undefined);
    const executor = new AgentAttemptExecutorService(
      { create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never,
      new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never,
      60_000, undefined, { running: vi.fn(async () => undefined), terminal, release: vi.fn() },
    );

    await executor.start(attemptInput());
    child.emit('exit', 0);
    await Promise.resolve();
    expect(terminal).not.toHaveBeenCalled();
    child.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify(durableResult('drained result')) }] } } }) + '\n'));
    await Promise.resolve();
    expect(terminal).not.toHaveBeenCalled();
    child.stdout.emit('close');

    await vi.waitFor(() => expect(terminal).toHaveBeenCalledWith(
      'attempt-1', 'succeeded', undefined, expect.objectContaining({ summary: 'drained result' }),
    ));
    expect(terminal).toHaveBeenCalledTimes(1);
  });

  it('fails boundedly when a provider completes without a strict durable result envelope', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-invalid-result', workspace: '/tmp/attempt-invalid-result/workspace', broker: '/tmp/attempt-invalid-result/broker', socketPath: '/tmp/attempt-invalid-result/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-invalid-result/broker/mcp.json' };
    const child = fakeChild(7678);
    const terminal = vi.fn(async () => undefined);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never, 60_000, undefined, { running: vi.fn(async () => undefined), terminal, release: vi.fn() });
    await executor.start(attemptInput());
    Object.assign(child, { exitCode: 0 });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { status: 'completed', items: [{ type: 'agentMessage', text: 'unstructured prose' }] } } }) + '\n'));
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledWith('attempt-1', 'failed', expect.objectContaining({ code: 'attempt_result_invalid' }), undefined));
  });

  it('accepts only Claude structured_output and never its raw result text', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-claude-result', workspace: '/tmp/attempt-claude-result/workspace', broker: '/tmp/attempt-claude-result/broker', socketPath: '/tmp/attempt-claude-result/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-claude-result/broker/mcp.json' };
    const child = fakeChild(7679);
    const terminal = vi.fn(async () => undefined);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never, 60_000, undefined, { running: vi.fn(async () => undefined), terminal, release: vi.fn() });
    await executor.start({ ...attemptInput(), runtime: 'claude_cli' });
    Object.assign(child, { exitCode: 0 });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'result', result: 'raw transcript must not persist', structured_output: durableResult('Claude concise result') }) + '\n'));
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledWith('attempt-1', 'succeeded', undefined, expect.objectContaining({ summary: 'Claude concise result' })));
  });

  it('requires the current AgentVersion to admit the Task-pinned runtime before allocating files', async () => {
    const files = { create: vi.fn(), remove: vi.fn() };
    const admission = { assert: vi.fn(async () => { throw new Error('attempt_runtime_not_pinned'); }) };
    const executor = new AgentAttemptExecutorService(files as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, undefined, undefined, admission);
    await expect(executor.start(attemptInput())).rejects.toThrow('attempt_runtime_not_pinned');
    expect(admission.assert).toHaveBeenCalledWith(expect.objectContaining({ agentVersionId: 'version', attemptId: 'attempt-1', sessionId: 'session', taskId: 'task' }), 'codex_cli');
    expect(files.create).not.toHaveBeenCalled();
  });

  it('permits ordinary credential-related business language while keeping CLI session flags out of prompts', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-prompt', workspace: '/tmp/attempt-prompt/workspace', broker: '/tmp/attempt-prompt/broker', socketPath: '/tmp/attempt-prompt/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-prompt/broker/mcp.json' };
    const child = fakeChild(7680);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never);
    await expect(executor.start({ ...attemptInput(), prompt: 'Explain the credential rotation policy without exposing a credential.' })).resolves.toBeDefined();
  });

  it('does not inspect ordinary business prompt text for authority-shaped words', async () => {
    const paths: AttemptFilesystemPaths = { root: '/tmp/attempt-prompt-authority', workspace: '/tmp/attempt-prompt-authority/workspace', broker: '/tmp/attempt-prompt-authority/broker', socketPath: '/tmp/attempt-prompt-authority/broker/attempt.sock', mcpConfigPath: '/tmp/attempt-prompt-authority/broker/mcp.json' };
    const child = fakeChild(7681);
    const executor = new AgentAttemptExecutorService({ create: vi.fn(async () => paths), remove: vi.fn(async () => undefined), linkProviderAuth: vi.fn(async () => undefined) } as never, new AgentAttemptProcessRegistry(), new AttemptLiveControlRegistry(), undefined, (() => child) as never);

    await expect(executor.start({ ...attemptInput(), prompt: 'Document the DATABASE_URL and MCP boundary without showing values.' })).resolves.toBeDefined();
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

function durableResult(summary: string) {
  return { outcome: 'completed', summary, resourceRefs: [], operationRefs: [] };
}
