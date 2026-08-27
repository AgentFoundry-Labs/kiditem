import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../../profile/agent-profile.catalog';
import { ActiveTurnRegistry } from '../../control/internal/active-turn.registry';
import { NativeClaudeProcessLauncher } from './claude-process-launcher';
import { ClaudeConversationProvider } from './claude-conversation.provider';
import { GatewayCommandDispatcher } from '../../control/gateway-command-dispatcher';
import { GatewayEventOutbox } from '../../control/gateway-event-outbox';
import { NativeGatewayControlSession } from '../../control/native-gateway-control-session';
import type { ProcessCallbacks } from '../../platform/process-supervisor';

describe('Claude tree-quiescence fatal control shutdown', () => {
  it('fails closed once when the first Claude terminate reports a re-entrant tree fatal', async () => {
    const treeFailure = new Error('provider_process_tree_termination_timeout');
    const supervisor = new FatalSupervisor(treeFailure);
    let control!: NativeGatewayControlSession;
    let reentrantShutdowns = 0;
    let reentrantShutdown: Promise<void> | null = null;
    const launcher = new NativeClaudeProcessLauncher({
      supervisor,
      onFatal: () => {
        reentrantShutdowns += 1;
        reentrantShutdown ??= control.shutdown();
        void reentrantShutdown.catch(() => undefined);
      },
    } as never);
    const configs = new MemoryClaudeConfigs();
    const provider = new ClaudeConversationProvider({
      runtimeRoot: '/gateway/runtime', workspace: '/gateway/workspace', loginRoot: '/gateway/login', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: 'T'.repeat(43),
      configs,
      launcher,
      sessions: { exists: async () => false, read: async () => [], remove: async () => undefined },
      randomSessionId: () => 'provider-thread-1',
      readiness: { runtime: 'claude_cli', version: '2.1.245', models: ['claude-fable-5'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'claude-fable-5', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    const conversation = await provider.create({ conversationId: 'conversation-1', instructionProfile: gatewayInstructionProfile(null) });
    const activeTurns = new ActiveTurnRegistry();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({
      activeTurns,
      outbox,
      gateway: {
        list: async () => [],
        create: async () => undefined,
        assertAccessible: async () => undefined,
        history: async () => [],
        rename: async () => undefined,
        delete: async () => undefined,
        startTurn: async (input) => provider.startTurn({
          providerConversationRef: conversation.providerConversationRef,
          conversationId: input.conversationId,
          turnId: input.turnId,
          message: input.message,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          instructionProfile: gatewayInstructionProfile(null),
        }, input.onEvent),
        interrupt: async () => undefined,
      },
      preferences: { read: async () => ({ schemaVersion: 1, contexts: {} }), set: async () => ({ schemaVersion: 1, contexts: {} }) },
    });
    let aborts = 0;
    let pollLossCalls = 0;
    control = new NativeGatewayControlSession({
      client: { poll: async () => null, postEventBody: async () => ({ eventSeq: 1, accepted: true }), abortInFlight: () => { aborts += 1; } },
      dispatcher,
      outbox,
      poll: poll(),
      onPollLoss: async () => {
        pollLossCalls += 1;
        const results = await Promise.allSettled([provider.close()]);
        const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
        try { await supervisor.shutdown(); }
        catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, 'gateway_provider_tree_shutdown_failed');
      },
    });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'turn-start-1', organizationId: 'organization-1', conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Work', model: 'claude-fable-5', reasoningEffort: 'medium',
    });
    expect(activeTurns.size).toBe(1);

    const shutdown = control.shutdown();
    let shutdownFailure: unknown;
    try { await shutdown; }
    catch (error) { shutdownFailure = error; }

    expect(shutdownFailure).toBeInstanceOf(AggregateError);
    const outer = shutdownFailure as AggregateError;
    expect(outer.message).toBe('gateway_provider_tree_shutdown_failed');
    const providerFailure = outer.errors[0] as AggregateError;
    expect(providerFailure).toBeInstanceOf(AggregateError);
    expect(providerFailure.message).toBe('claude_provider_close_failed');
    expect(providerFailure.errors).toEqual([treeFailure]);
    expect(reentrantShutdown).not.toBeNull();
    expect(reentrantShutdowns).toBe(1);
    expect(pollLossCalls).toBe(1);
    expect(supervisor.terminateCalls).toBe(1);
    expect(supervisor.shutdownCalls).toBe(1);
    expect(activeTurns.size).toBe(0);
    expect(events(outbox)).toContainEqual({ kind: 'turn.terminal', conversationId: 'conversation-1', turnId: 'turn-1', status: 'disconnected' });
    expect(aborts).toBe(1);
  });
});

class MemoryClaudeConfigs {
  async create() { return '/gateway/state/1.json'; }
  async remove() { return undefined; }
  async close() { return undefined; }
}

class FatalSupervisor {
  private callbacks: ProcessCallbacks = {};
  private fatalReported = false;
  terminateCalls = 0;
  shutdownCalls = 0;

  constructor(private readonly failure: Error) {}

  async launch(_command: unknown, callbacks: ProcessCallbacks = {}) {
    this.callbacks = callbacks;
    return {
      input: async () => undefined,
      terminate: async () => {
        this.terminateCalls += 1;
        if (!this.fatalReported) {
          this.fatalReported = true;
          this.callbacks.onFatal?.(this.failure);
        }
        throw this.failure;
      },
      onExit: () => undefined,
    };
  }

  async shutdown() { this.shutdownCalls += 1; }
}

function poll() {
  return {
    kind: 'poll' as const,
    gatewayInstanceId: 'gateway-1',
    platform: 'macos' as const,
    mcpTransportToken: 'A'.repeat(43),
    runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
  };
}

function events(outbox: GatewayEventOutbox): Array<Record<string, unknown>> {
  const body = outbox.peekBody();
  return body ? (JSON.parse(body) as { events: Array<Record<string, unknown>> }).events : [];
}
