import { describe, expect, it } from 'vitest';

describe('GatewayCommandDispatcher', () => {
  it('dispatches Gateway commands once, enforces one live turn per conversation, and releases exactly once on terminal events', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-1', conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start work.', model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: 'binding-1',
    });
    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-2', conversationId: 'conversation-1', turnId: 'turn-2',
      message: 'Must not run concurrently.', model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: 'binding-2',
    });
    gateway.emit({ kind: 'status', status: 'completed' });
    gateway.emit({ kind: 'status', status: 'completed' });

    expect(gateway.started).toHaveLength(1);
    expect(events(outbox)).toEqual(expect.arrayContaining([
      { kind: 'command.ack', commandId: 'command-1' },
      { kind: 'command.rejected', commandId: 'command-2', code: 'invalid_state' },
      { kind: 'turn.terminal', conversationId: 'conversation-1', turnId: 'turn-1', status: 'completed' },
    ]));
    expect(events(outbox).filter((event) => event.kind === 'turn.terminal')).toHaveLength(1);

    gateway.emit({ kind: 'assistant.delta', delta: 'Late output must not cross the terminal boundary.' });
    expect(events(outbox).filter((event) => event.kind === 'turn.event')).toEqual([
      { kind: 'turn.event', conversationId: 'conversation-1', turnId: 'turn-1', event: { kind: 'status', status: 'completed' } },
    ]);

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-3', conversationId: 'conversation-1', turnId: 'turn-3',
      message: 'May start after release.', model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: 'binding-3',
    });
    expect(gateway.started).toHaveLength(2);
  });

  it('does not retry a previously applied command ID, but rejects an ID reused with different content', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox });
    const command = { kind: 'conversation.list' as const, commandId: 'command-1' };

    await dispatcher.dispatch(command);
    await dispatcher.dispatch(command);
    await dispatcher.dispatch({ ...command, runtime: 'codex_cli' });

    expect(gateway.listCalls).toBe(1);
    expect(events(outbox)).toEqual(expect.arrayContaining([
      { kind: 'conversation.listed', commandId: 'command-1', conversations: [] },
      { kind: 'command.ack', commandId: 'command-1' },
      { kind: 'command.rejected', commandId: 'command-1', code: 'invalid_state' },
    ]));
  });

  it('stores only a canonical digest of an execution binding and redacts it from every outbound provider string', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const binding = 'B'.repeat(43);
    const gateway = new FakeConversationGateway();
    gateway.messages = [{ id: 'message-1', role: 'assistant', content: `Provider echoed ${binding}`, createdAt: '2026-08-23T00:00:00.000Z' }];
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-1', conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start work.', model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: binding,
    });
    gateway.emit({ kind: 'status', status: 'started', detail: `Binding: ${binding}` });
    await dispatcher.dispatch({ kind: 'conversation.history', commandId: 'command-2', conversationId: 'conversation-1' });

    const applied = (dispatcher as unknown as { applied: Map<string, string> }).applied;
    expect(JSON.stringify([...applied.values()])).not.toContain(binding);
    expect(outbox.peekBody()).not.toContain(binding);
  });
});

function events(outbox: { peekBody(): string | null }): Array<Record<string, unknown>> {
  const body = outbox.peekBody();
  if (!body) return [];
  return (JSON.parse(body) as { events: Array<Record<string, unknown>> }).events;
}

class FakeConversationGateway {
  started: unknown[] = [];
  listCalls = 0;
  messages: unknown[] = [];
  private sink: ((event: GatewayProviderEvent) => void) | undefined;

  async list() { this.listCalls += 1; return []; }
  async create() { return { id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'New', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }; }
  async history() { return this.messages; }
  async rename() { return { id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'New', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }; }
  async delete() { return undefined; }
  async sendInput() { return undefined; }
  async interrupt() { return undefined; }
  async startTurn(input: { onEvent: (event: GatewayProviderEvent) => void }) {
    this.started.push(input);
    this.sink = input.onEvent;
  }
  emit(event: GatewayProviderEvent) { this.sink?.(event); }
}

type GatewayProviderEvent =
  | { kind: 'status'; status: 'started' | 'completed' | 'failed' | 'interrupted' | 'disconnected'; detail?: string }
  | { kind: 'assistant.delta'; delta: string };
