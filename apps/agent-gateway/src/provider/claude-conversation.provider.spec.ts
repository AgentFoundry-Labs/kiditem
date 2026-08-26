import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../profile/agent-profile.catalog';

const GENERAL_PROFILE = gatewayInstructionProfile(null);
const SOURCING_PROFILE = gatewayInstructionProfile('sourcing');

describe('ClaudeConversationProvider', () => {
  it('creates a random provider session, uses session-id once then resume, binds fresh MCP config per turn, and reads provider-native history only', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    const configs = new FakeClaudeConfigs();
    const sessions = {
      exists: async () => launcher.starts.length > 0,
      read: async () => [{ id: 'provider-message-1', role: 'assistant' as const, content: 'Provider-owned history', createdAt: '2026-08-23T00:00:00.000Z' }],
      remove: async () => undefined,
    };
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs, launcher, sessions, randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium', 'high'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium', 'high'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ title: 'Claude research', instructionProfile: SOURCING_PROFILE });
    const events: unknown[] = [];
    await provider.startTurn({ providerConversationRef: created.providerConversationRef, turnId: 'turn-1', message: 'First message', model: 'claude-fable-5', reasoningEffort: 'high', executionBinding: 'A'.repeat(43), instructionProfile: SOURCING_PROFILE }, (event) => events.push(event));
    launcher.emit(0, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'First answer' }] } })}\n${JSON.stringify({ type: 'result', is_error: false })}\n`);
    launcher.exit(0, 0);
    await flush();
    await provider.startTurn({ providerConversationRef: created.providerConversationRef, turnId: 'turn-2', message: 'Second message', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'B'.repeat(43), instructionProfile: SOURCING_PROFILE }, (event) => events.push(event));

    expect(created.providerConversationRef).toBe('33333333-3333-4333-8333-333333333333');
    expect(launcher.starts.map(({ command }) => command.args)).toEqual([
      expect.arrayContaining(['--session-id', '33333333-3333-4333-8333-333333333333']),
      expect.arrayContaining(['--resume', '33333333-3333-4333-8333-333333333333']),
    ]);
    expect(launcher.starts.map(({ command }) => command.args.join(' ')).join('\n')).not.toContain('A'.repeat(43));
    expect(configs.created.map(({ executionBinding }) => executionBinding)).toEqual(['A'.repeat(43), 'B'.repeat(43)]);
    expect(await provider.history(created.providerConversationRef)).toEqual(await sessions.read());
    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'assistant.delta', delta: 'First answer' },
      { kind: 'status', status: 'completed' },
      { kind: 'status', status: 'started' },
    ]);
  });

  it('has no Claude transcript cache and removes only the opaque provider session through the native session store', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const sessions = new FakeClaudeSessions();
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher: new FakeClaudeLauncher(), sessions,
      randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });

    expect(JSON.stringify(provider)).not.toContain('transcript');
    await expect(provider.delete('33333333-3333-4333-8333-333333333333')).resolves.toBeUndefined();
    expect(sessions.removed).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('checks provider-owned session existence on every start, retains session-id after launch failure, and replays output that arrives before the handle', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    launcher.failNext = true;
    const sessions = { exists: async () => false, read: async () => [], remove: async () => undefined };
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher, sessions, randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ instructionProfile: GENERAL_PROFILE });
    const input = { providerConversationRef: created.providerConversationRef, turnId: 'turn-1', message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: GENERAL_PROFILE };

    await expect(provider.startTurn(input, () => undefined)).rejects.toThrow('claude_launch_failed');
    const events: unknown[] = [];
    launcher.outputBeforeReturn = `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Early answer' }] } })}\n`;
    launcher.exitBeforeReturn = 0;
    await provider.startTurn(input, (event) => events.push(event));

    expect(launcher.starts.map(({ command }) => command.args.filter((value) => value === '--session-id'))).toEqual([['--session-id'], ['--session-id']]);
    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'assistant.delta', delta: 'Early answer' },
      { kind: 'status', status: 'completed' },
    ]);
  });

  it('interrupts and releases every active Claude turn exactly once on Gateway disconnect', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher, sessions: { exists: async () => false, read: async () => [], remove: async () => undefined },
      randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ instructionProfile: GENERAL_PROFILE });
    const events: unknown[] = [];
    await provider.startTurn({ providerConversationRef: created.providerConversationRef, turnId: 'turn-1', message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: GENERAL_PROFILE }, (event) => events.push(event));

    await provider.close();
    await provider.close();
    expect(events).toEqual([{ kind: 'status', status: 'started' }, { kind: 'status', status: 'disconnected' }]);
  });

  it('drops late provider output after a terminal event so an already-released Gateway turn cannot stream again', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher, sessions: { exists: async () => false, read: async () => [], remove: async () => undefined },
      randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ instructionProfile: GENERAL_PROFILE });
    const events: unknown[] = [];
    await provider.startTurn({ providerConversationRef: created.providerConversationRef, turnId: 'turn-1', message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: GENERAL_PROFILE }, (event) => events.push(event));

    launcher.emit(0, `${JSON.stringify({ type: 'result', is_error: false })}\n`);
    launcher.emit(0, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'late' }] } })}\n`);
    launcher.exit(0, 0);
    await flush();

    expect(events).toEqual([{ kind: 'status', status: 'started' }, { kind: 'status', status: 'completed' }]);
  });

  it('waits for a still-running child to terminate after malformed output before releasing its active turn', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    const termination = deferred<void>();
    launcher.interruptGate = termination.promise;
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher, sessions: { exists: async () => false, read: async () => [], remove: async () => undefined },
      randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ instructionProfile: GENERAL_PROFILE });
    const input = { providerConversationRef: created.providerConversationRef, turnId: 'turn-malformed-output', message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: GENERAL_PROFILE };
    const events: unknown[] = [];

    await provider.startTurn(input, (event) => events.push(event));
    launcher.emit(0, '{malformed-json\n');
    await flush();

    expect(launcher.interruptCalls).toBe(1);
    expect(events).toEqual([{ kind: 'status', status: 'started' }]);
    // A parent-exit notification is not enough: the terminate promise is the
    // supervised proof that its descendant tree is gone.
    launcher.exit(0, 0);
    await flush();
    expect(events).toEqual([{ kind: 'status', status: 'started' }]);
    await expect(provider.startTurn(input, () => undefined)).rejects.toThrow('claude_turn_already_live');

    termination.resolve();
    await flush();
    expect(events).toEqual([{ kind: 'status', status: 'started' }, { kind: 'status', status: 'failed' }]);
  });

  it('also waits for tree termination when malformed output arrives before the launcher returns its handle', async () => {
    const { ClaudeConversationProvider } = await import('./claude-conversation.provider');
    const launcher = new FakeClaudeLauncher();
    const termination = deferred<void>();
    launcher.outputBeforeReturn = '{malformed-json\n';
    launcher.interruptGate = termination.promise;
    const provider = new ClaudeConversationProvider({
      runtimeRoot: process.cwd(), workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      configs: new FakeClaudeConfigs(), launcher, sessions: { exists: async () => false, read: async () => [], remove: async () => undefined },
      randomSessionId: () => '33333333-3333-4333-8333-333333333333',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const created = await provider.create({ instructionProfile: GENERAL_PROFILE });
    const input = { providerConversationRef: created.providerConversationRef, turnId: 'turn-early-malformed-output', message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: GENERAL_PROFILE };
    const events: unknown[] = [];

    const starting = provider.startTurn(input, (event) => events.push(event));
    await flush();

    expect(launcher.interruptCalls).toBe(1);
    expect(events).toEqual([{ kind: 'status', status: 'started' }]);
    await expect(provider.startTurn(input, () => undefined)).rejects.toThrow('claude_turn_already_live');

    termination.resolve();
    await starting;
    expect(events).toEqual([{ kind: 'status', status: 'started' }, { kind: 'status', status: 'failed' }]);
  });
});

class FakeClaudeConfigs {
  created: Array<{ turnId: string; mcpUrl: string; executionBinding: string }> = [];
  removed: string[] = [];
  async create(input: { turnId: string; mcpUrl: string; executionBinding: string }) { this.created.push(input); return `/gateway/state/${this.created.length}.json`; }
  async remove(path: string) { this.removed.push(path); }
}

class FakeClaudeSessions {
  removed: string[] = [];
  async exists() { return false; }
  async read() { return []; }
  async remove(sessionId: string) { this.removed.push(sessionId); }
}

class FakeClaudeLauncher {
  starts: Array<{ command: { args: readonly string[] }; input: string; onOutput: (chunk: string) => void; onExit: (code: number | null) => void }> = [];
  failNext = false;
  outputBeforeReturn: string | undefined;
  exitBeforeReturn: number | null | undefined;
  interruptCalls = 0;
  interruptGate: Promise<void> | undefined;
  async start(input: { command: { args: readonly string[] }; input: string; onOutput: (chunk: string) => void; onExit: (code: number | null) => void }) {
    this.starts.push(input);
    if (this.failNext) { this.failNext = false; throw new Error('claude_launch_failed'); }
    if (this.outputBeforeReturn) input.onOutput(this.outputBeforeReturn);
    if (this.exitBeforeReturn !== undefined) input.onExit(this.exitBeforeReturn);
    return {
      sendInput: async () => undefined,
      interrupt: async () => {
        this.interruptCalls += 1;
        await this.interruptGate;
      },
    };
  }
  emit(index: number, chunk: string) { this.starts[index]?.onOutput(chunk); }
  exit(index: number, code: number | null) { this.starts[index]?.onExit(code); }
}

async function flush(): Promise<void> { for (let index = 0; index < 4; index += 1) await Promise.resolve(); }

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((resolvePromise) => { resolve = resolvePromise; }),
    resolve: (value: T) => resolve(value),
  };
}
