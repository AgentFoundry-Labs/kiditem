import { describe, expect, it, vi } from 'vitest';

const ORGANIZATION_ID = 'organization-1';

describe('GatewayCommandDispatcher', () => {
  it('dispatches Gateway commands once, enforces one live turn per conversation, and releases exactly once on terminal events', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-1', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start work.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-2', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-2',
      message: 'Must not run concurrently.', model: 'gpt-5.6', reasoningEffort: 'medium',
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
      kind: 'turn.start', commandId: 'command-3', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-3',
      message: 'May start after release.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    expect(gateway.started).toHaveLength(2);
  });

  it('does not retry a previously applied command ID, but rejects an ID reused with different content', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });
    const command = { kind: 'conversation.list' as const, commandId: 'command-1', organizationId: ORGANIZATION_ID };

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

  it('keeps the process transport token out of commands and redacts it from every outbound provider string', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const mcpTransportToken = 'B'.repeat(43);
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1', redactionTokens: [mcpTransportToken] });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-1', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start work.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    gateway.emit({ kind: 'status', status: 'started', detail: `Transport: ${mcpTransportToken}` });

    const applied = (dispatcher as unknown as { applied: Map<string, string> }).applied;
    expect(JSON.stringify([...applied.values()])).not.toContain(mcpTransportToken);
    expect(outbox.peekBody()).not.toContain(mcpTransportToken);
  });

  it('keeps the active turn open after an interrupt acknowledgement until the provider emits its terminal event', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-start', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    await dispatcher.dispatch({ kind: 'turn.interrupt', commandId: 'command-interrupt', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1' });

    let beforeTerminal: Array<Record<string, unknown>> = [];
    await outbox.flush(async (body) => {
      beforeTerminal = (JSON.parse(body) as { events: Array<Record<string, unknown>> }).events;
      return { eventSeq: 1, accepted: true as const };
    });
    expect(beforeTerminal.filter((event) => event.kind === 'turn.terminal')).toEqual([]);
    gateway.emit({ kind: 'status', status: 'interrupted' });
    expect(events(outbox).filter((event) => event.kind === 'turn.terminal')).toEqual([
      { kind: 'turn.terminal', conversationId: 'conversation-1', turnId: 'turn-1', status: 'interrupted' },
    ]);
  });

  it('keeps the local turn fence when the exact terminal cannot be retained', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { ActiveTurnRegistry } = await import('./internal/active-turn.registry');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const activeTurns = new ActiveTurnRegistry();
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, activeTurns, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-start', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Start.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    for (let index = 0; index < 126; index += 1) {
      outbox.enqueue({ kind: 'command.ack', commandId: `filler-${index}` });
    }

    expect(() => gateway.emit({ kind: 'status', status: 'completed' })).toThrow('gateway_event_backpressure');
    expect(activeTurns.size).toBe(1);
  });

  it('keeps locally live turn fences after fresh API registration until their exact provider terminals arrive', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-start-old', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-old',
      message: 'Old work.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });

    const reset = dispatcher.resetAfterApiRuntimeRegistration();
    await Promise.resolve();
    await Promise.resolve();

    expect(gateway.interrupted).toEqual([{ conversationId: 'conversation-1', turnId: 'turn-old' }]);
    expect(gateway.deletedConversationIds).toEqual([]);

    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-start-blocked', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-blocked',
      message: 'Must remain fenced until the exact terminal.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });
    gateway.emitFor('turn-old', { kind: 'status', status: 'interrupted' });
    await reset;
    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'command-start-new', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-new',
      message: 'A new explicit turn may begin after terminal.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });

    expect(gateway.started).toHaveLength(2);
    expect(events(outbox)).toEqual(expect.arrayContaining([
      { kind: 'command.rejected', commandId: 'command-start-blocked', code: 'invalid_state' },
      { kind: 'turn.terminal', conversationId: 'conversation-1', turnId: 'turn-old', status: 'interrupted' },
    ]));
  });

  it('fails the API-runtime reset when an interrupted turn misses its bounded terminal deadline', async () => {
    vi.useFakeTimers();
    try {
      const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
      const { GatewayEventOutbox } = await import('./gateway-event-outbox');
      const gateway = new FakeConversationGateway();
      const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
      const dispatcher = new GatewayCommandDispatcher({
        gateway,
        outbox,
        preferences: new FakeConversationPreferences(),
        terminalDeadlineMs: 25,
      });

      await dispatcher.dispatch({
        kind: 'turn.start', commandId: 'command-start-old', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-old',
        message: 'Old work.', model: 'gpt-5.6', reasoningEffort: 'medium',
      });
      const reset = dispatcher.resetAfterApiRuntimeRegistration();
      const timeout = expect(reset).rejects.toThrow('gateway_api_runtime_terminal_timeout');

      await vi.advanceTimersByTimeAsync(25);
      await timeout;
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps immutable create identity drift to invalid_state without emitting provider-local data', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    gateway.createFailure = new Error('gateway_conversation_create_conflict');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({
      kind: 'conversation.create', commandId: 'command-create-conflict', organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-conflict',
      runtime: 'codex_cli', agentKey: null, title: 'General chat',
    });

    expect(gateway.createInputs).toEqual([{
      organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-conflict', runtime: 'codex_cli', agentKey: null, title: 'General chat',
    }]);
    expect(events(outbox)).toEqual([{ kind: 'command.rejected', commandId: 'command-create-conflict', code: 'invalid_state' }]);
    expect(outbox.peekBody()).not.toContain('provider-thread');
  });

  it('rejects deletion of an exact conversation with a live local turn before it reaches the provider gateway', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { ActiveTurnRegistry } = await import('./internal/active-turn.registry');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const activeTurns = new ActiveTurnRegistry();
    activeTurns.admit({ conversationId: 'conversation-live', turnId: 'turn-live' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, activeTurns, preferences: new FakeConversationPreferences() });

    await dispatcher.dispatch({ kind: 'conversation.delete', commandId: 'command-delete-live', organizationId: ORGANIZATION_ID, conversationId: 'conversation-live' });

    expect(gateway.deletedConversationIds).toEqual([]);
    expect(events(outbox)).toEqual([{ kind: 'command.rejected', commandId: 'command-delete-live', code: 'invalid_state' }]);
  });

  it('emits exact local preference results before acknowledging get and set commands', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const preferences = new FakeConversationPreferences();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences });

    await dispatcher.dispatch({ kind: 'conversation.preferences.get', commandId: 'command-preferences-get' });
    await dispatcher.dispatch({
      kind: 'conversation.preferences.set', commandId: 'command-preferences-set', context: 'general', runtime: 'codex_cli',
      model: 'gpt-5.6', reasoningEffort: 'medium',
    });

    expect(events(outbox)).toEqual([
      { kind: 'conversation.preferences.loaded', commandId: 'command-preferences-get', preferences: { schemaVersion: 1, contexts: {} } },
      { kind: 'command.ack', commandId: 'command-preferences-get' },
      {
        kind: 'conversation.preferences.updated', commandId: 'command-preferences-set', preferences: {
          schemaVersion: 1,
          contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } } },
        },
      },
      { kind: 'command.ack', commandId: 'command-preferences-set' },
    ]);
  });

  it('returns not_found before active-turn checks for every foreign organization command', async () => {
    const { GatewayCommandDispatcher } = await import('./gateway-command-dispatcher');
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const gateway = new FakeConversationGateway();
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences: new FakeConversationPreferences() });
    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'owner-start', organizationId: ORGANIZATION_ID, conversationId: 'conversation-1', turnId: 'turn-1',
      message: 'Owner turn.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });

    await dispatcher.dispatch({ kind: 'conversation.delete', commandId: 'foreign-delete', organizationId: 'organization-foreign', conversationId: 'conversation-1' });
    await dispatcher.dispatch({ kind: 'turn.interrupt', commandId: 'foreign-interrupt', organizationId: 'organization-foreign', conversationId: 'conversation-1', turnId: 'turn-1' });
    await dispatcher.dispatch({
      kind: 'turn.start', commandId: 'foreign-start', organizationId: 'organization-foreign', conversationId: 'conversation-1', turnId: 'turn-2',
      message: 'Foreign turn.', model: 'gpt-5.6', reasoningEffort: 'medium',
    });

    expect(gateway.deletedConversationIds).toEqual([]);
    expect(gateway.interrupted).toEqual([]);
    expect(gateway.started).toHaveLength(1);
    expect(events(outbox)).toEqual(expect.arrayContaining([
      { kind: 'command.rejected', commandId: 'foreign-delete', code: 'not_found' },
      { kind: 'command.rejected', commandId: 'foreign-interrupt', code: 'not_found' },
      { kind: 'command.rejected', commandId: 'foreign-start', code: 'not_found' },
    ]));
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
  createInputs: unknown[] = [];
  createFailure: Error | undefined;
  deletedConversationIds: string[] = [];
  interrupted: Array<{ conversationId: string; turnId: string }> = [];
  private readonly sinks = new Map<string, (event: GatewayProviderEvent) => void>();

  async list() { this.listCalls += 1; return []; }
  async assertAccessible(input: { organizationId: string }) {
    if (input.organizationId !== ORGANIZATION_ID) throw new Error('gateway_conversation_not_found');
  }
  async create(input: unknown) {
    this.createInputs.push(input);
    if (this.createFailure) throw this.createFailure;
    return { id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'New', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' };
  }
  async rename() { return { id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'New', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }; }
  async delete(input: { conversationId: string }) { this.deletedConversationIds.push(input.conversationId); }
  async interrupt(input: { conversationId: string; turnId: string }) {
    this.interrupted.push({ conversationId: input.conversationId, turnId: input.turnId });
  }
  async startTurn(input: { conversationId: string; turnId: string; onEvent: (event: GatewayProviderEvent) => void }) {
    this.started.push(input);
    this.sinks.set(input.turnId, input.onEvent);
  }
  emit(event: GatewayProviderEvent) { [...this.sinks.values()].at(-1)?.(event); }
  emitFor(turnId: string, event: GatewayProviderEvent) { this.sinks.get(turnId)?.(event); }
}

class FakeConversationPreferences {
  private document: { schemaVersion: 1; contexts: Record<string, Record<string, { model: string; reasoningEffort: string }> | undefined> } = {
    schemaVersion: 1,
    contexts: {},
  };

  async read() { return this.document; }

  async set(input: { context: string; runtime: string; model: string; reasoningEffort: string }) {
    this.document = {
      schemaVersion: 1,
      contexts: {
        ...this.document.contexts,
        [input.context]: {
          ...this.document.contexts[input.context],
          [input.runtime]: { model: input.model, reasoningEffort: input.reasoningEffort },
        },
      },
    };
    return this.document;
  }
}

type GatewayProviderEvent =
  | { kind: 'status'; status: 'started' | 'completed' | 'failed' | 'interrupted' | 'disconnected'; detail?: string }
  | { kind: 'assistant.delta'; delta: string };
