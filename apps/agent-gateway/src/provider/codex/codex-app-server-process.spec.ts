import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessCallbacks, ProcessExit } from '../../platform/process-supervisor';
import { gatewayInstructionProfile } from '../../profile/agent-profile.catalog';
import { GatewayEventOutbox } from '../../control/gateway-event-outbox';
import { NativeGatewayControlSession } from '../../control/native-gateway-control-session';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

afterEach(() => { spawnMock.mockReset(); vi.restoreAllMocks(); });

describe('startCodexAppServer', () => {
  it('owns the Codex app-server through the platform process-tree supervisor until its tree termination resolves', async () => {
    const { startCodexAppServer } = await import('./codex-app-server-process');
    spawnMock.mockReturnValue(fakeChild());
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);

    expect(supervisor.launches).toEqual([expect.objectContaining({
      args: expect.arrayContaining(['app-server']),
      cwd: '/gateway/workspace',
    })]);
    expect(spawnMock).not.toHaveBeenCalled();

    const closing = process.close();
    expect(supervisor.process.terminateCalls).toBe(1);
    await expect(closing).resolves.toBeUndefined();
  });

  it('keeps the app-server session live when one stdout callback coalesces individually bounded JSON-RPC frames', async () => {
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);
    const catalogFrame = notification('item/started', { payload: 'a'.repeat(20_595) });
    const resultFrame = notification('item/completed', { payload: 'b'.repeat(44_144) });
    const trailerFrame = notification('turn/completed', { payload: 'c'.repeat(1_024) });

    expect(Buffer.byteLength(catalogFrame, 'utf8')).toBeLessThan(64 * 1024);
    expect(Buffer.byteLength(resultFrame, 'utf8')).toBeLessThan(64 * 1024);
    expect(Buffer.byteLength(trailerFrame, 'utf8')).toBeLessThan(64 * 1024);
    expect(Buffer.byteLength(`${catalogFrame}${resultFrame}${trailerFrame}`, 'utf8')).toBeGreaterThan(64 * 1024);

    supervisor.emitStdout(`${catalogFrame}${resultFrame}${trailerFrame}`);
    await advance();

    expect(supervisor.process.terminateCalls).toBe(0);
    const catalog = process.session.modelCatalog();
    await advance();
    answer(supervisor, 'initialize', {});
    await advance();
    answer(supervisor, 'model/list', {
      data: [{ model: 'gpt-5.6', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }],
    });
    await expect(catalog).resolves.toEqual([{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }]);
  });

  it('keeps the session usable after a valid Codex MCP item-completed frame carries an 8 MiB result', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);
    const events: unknown[] = [];
    const started = process.session.startTurn({
      providerConversationRef: 'provider-thread-1',
      conversationId: 'conversation-1',
      turnId: 'gateway-turn-1',
      message: 'List available resources.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      instructionProfile: gatewayInstructionProfile(null),
    }, (event) => events.push(event));
    await advance();
    answer(supervisor, 'initialize', {});
    await advance();
    answer(supervisor, 'thread/resume', { approvalPolicy: 'never', sandbox: { type: 'dangerFullAccess' } });
    await advance();
    answer(supervisor, 'turn/start', { turn: { id: 'provider-turn-1' } });
    await started;

    const mcpResult = 'r'.repeat(8 * 1024 * 1024);
    const completed = notification('item/completed', {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      completedAtMs: 1,
      item: {
        type: 'mcpToolCall',
        id: 'mcp-list-resources',
        server: 'kiditem',
        tool: 'codex.list_mcp_resources',
        status: 'completed',
        arguments: {},
        appContext: null,
        mcpAppResourceUri: null,
        pluginId: null,
        readOnlyHint: true,
        result: { content: [{ type: 'text', text: mcpResult }], isError: false },
        error: null,
        durationMs: 1,
      },
    });
    expect(Buffer.byteLength(completed, 'utf8')).toBeGreaterThan(8 * 1024 * 1024);
    expect(Buffer.byteLength(completed, 'utf8')).toBeLessThan((8 * 1024 * 1024) + (64 * 1024));

    supervisor.emitStdout(completed);
    await advance();

    expect(diagnostic).not.toHaveBeenCalled();
    expect(supervisor.process.terminateCalls).toBe(0);
    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'tool.status', name: 'kiditem.codex.list_mcp_resources', status: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain(mcpResult);
    const catalog = process.session.modelCatalog();
    await advance();
    answer(supervisor, 'model/list', {
      data: [{ model: 'gpt-5.6', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }],
    });
    await expect(catalog).resolves.toEqual([{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }]);
  });

  it('terminates the supervised provider tree and fails the provider closed after a malformed frame', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [{ startCodexAppServer }, { CodexConversationProvider }] = await Promise.all([
      import('./codex-app-server-process'),
      import('./codex-conversation.provider'),
    ]);
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);
    const provider = new CodexConversationProvider({
      session: process.session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });

    supervisor.emitStdout('{bad}\n');
    await advance();

    expect(diagnostic).toHaveBeenCalledWith('agent_gateway_codex_app_server_session_framing_fault code=codex_app_server_output_invalid bytes=5');
    expect(supervisor.process.terminateCalls).toBe(1);
    await expect(process.session.modelCatalog()).rejects.toThrow('codex_app_server_closed');
    await expect(provider.readiness()).rejects.toThrow('codex_app_server_closed');
  });

  it('propagates a malformed Codex frame once through the Gateway control shutdown and provider-tree close', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const abortInFlight = vi.fn();
    const dispatcher = {
      dispatch: vi.fn(),
      clear: vi.fn(),
      resetAfterApiRuntimeRegistration: vi.fn(),
    };
    let control!: NativeGatewayControlSession;
    const onFatal = vi.fn(() => { void control.shutdown(); });
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal,
    });
    const onPollLoss = vi.fn(async () => {
      await process.close();
      await supervisor.shutdown();
    });
    control = new NativeGatewayControlSession({
      client: {
        poll: async () => new Promise<never>(() => undefined),
        postEventBody: async () => ({ eventSeq: 1, accepted: true as const }),
        abortInFlight,
      },
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll',
        gatewayInstanceId: 'gateway-1',
        platform: 'macos',
        mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: {
          controlRevision: 'kiditem-gateway-control-v1',
          mcpProtocolRevision: '2026-07-28',
          nodeMajor: 22,
          codexVersion: '0.149.1',
          claudeVersion: '2.1.245',
        },
      },
      onPollLoss,
    });
    const running = control.run();
    await advance();

    supervisor.emitStdout('{bad}\n');
    await advance();

    expect(diagnostic).toHaveBeenCalledWith('agent_gateway_codex_app_server_session_framing_fault code=codex_app_server_output_invalid bytes=5');
    expect(onFatal).toHaveBeenCalledOnce();
    await expect(running).rejects.toThrow('gateway_control_stopped');
    expect(abortInFlight).toHaveBeenCalledOnce();
    expect(onPollLoss).toHaveBeenCalledOnce();
    expect(supervisor.process.terminateCalls).toBe(1);
    expect(supervisor.shutdownCalls).toBe(1);
    expect(dispatcher.clear).toHaveBeenCalledOnce();
  });

  it('terminates the supervised provider tree after a true oversized frame without logging its payload', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);
    const payload = 'x'.repeat((8 * 1024 * 1024) + (64 * 1024) + 1);

    supervisor.emitStdout(payload);
    await advance();

    expect(diagnostic).toHaveBeenCalledWith(`agent_gateway_codex_app_server_session_framing_fault code=codex_app_server_output_too_large bytes=${(8 * 1024 * 1024) + (64 * 1024) + 1}`);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(payload);
    expect(supervisor.process.terminateCalls).toBe(1);
    await expect(process.session.modelCatalog()).rejects.toThrow('codex_app_server_closed');
  });

  it('reports a native app-server exit with only its code and signal', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal: () => undefined,
    } as never);

    supervisor.emitExit({ code: 73, signal: null });

    expect(diagnostic).toHaveBeenCalledWith('agent_gateway_codex_app_server_native_exit code=73 signal=null');
    expect(supervisor.process.terminateCalls).toBe(0);
    await expect(process.session.modelCatalog()).rejects.toThrow('codex_app_server_closed');
  });

  it('propagates a supervisor tree-quiescence fatal to the Gateway lifecycle once and closes the session', async () => {
    const { startCodexAppServer } = await import('./codex-app-server-process');
    const supervisor = new RecordingSupervisor();
    const onFatal = vi.fn();
    const process = await startCodexAppServer({
      runtimeRoot: '/gateway/runtime',
      workspace: '/gateway/workspace',
      loginRoot: '/gateway/login',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'T'.repeat(43),
      supervisor,
      onFatal,
    } as never);
    const failure = new Error('provider_process_tree_termination_timeout');

    supervisor.emitFatal(failure);
    supervisor.emitFatal(failure);

    expect(onFatal).toHaveBeenCalledOnce();
    expect(onFatal).toHaveBeenCalledWith(failure);
    expect(process.session.isClosed()).toBe(true);
  });
});

class RecordingSupervisor {
  readonly launches: unknown[] = [];
  readonly process = new RecordingProcess();
  private callbacks: ProcessCallbacks = {};
  shutdownCalls = 0;

  async launch(command: unknown, callbacks: ProcessCallbacks = {}) {
    this.launches.push(command);
    this.callbacks = callbacks;
    return this.process;
  }

  async shutdown() { this.shutdownCalls += 1; }

  emitStdout(chunk: string): void { this.callbacks.onStdout?.(chunk); }
  emitExit(exit: ProcessExit): void { this.callbacks.onExit?.(exit); }
  emitFatal(error: Error): void { this.callbacks.onFatal?.(error); }
}

class RecordingProcess {
  terminateCalls = 0;
  readonly inputs: string[] = [];
  async input(value: string) { this.inputs.push(value); }
  async terminate() { this.terminateCalls += 1; }
  onExit() { return undefined; }
}

function fakeChild() {
  const events = new EventEmitter();
  return Object.assign(events, {
    stdin: { write: (_value: string, _encoding: string, callback: (error?: Error | null) => void) => callback(null) },
    stdout: new EventEmitter(),
    kill: () => true,
  });
}

function notification(method: string, params: unknown): string {
  return `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
}

function answer(supervisor: RecordingSupervisor, method: string, result: unknown): void {
  const request = supervisor.process.inputs
    .map((line) => JSON.parse(line) as { id?: string; method?: string })
    .find((line) => line.method === method && typeof line.id === 'string');
  if (!request?.id) throw new Error(`missing ${method}`);
  supervisor.emitStdout(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
}

async function advance(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}
