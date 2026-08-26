import { describe, expect, it, vi } from 'vitest';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
};

const PREFERENCES = {
  schemaVersion: 1 as const,
  contexts: {
    general: {
      codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' },
    },
  },
};

describe('GatewayCommandResponseBroker', () => {
  it('keeps a command correlation through transport acknowledgement until its bounded provider result arrives', async () => {
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const request = broker.begin<unknown[]>({
      ...OWNER,
      command: { kind: 'conversation.history', commandId: 'command-1', conversationId: 'conversation-1' },
    });

    broker.acknowledge('command-1');
    broker.resolveConversationHistory({
      kind: 'conversation.history', commandId: 'command-1', conversationId: 'conversation-1',
      messages: [{ id: 'message-1', role: 'assistant', content: 'Provider-owned history.', createdAt: '2026-08-26T00:00:00.000Z' }],
    });

    await expect(request.result).resolves.toEqual([{
      id: 'message-1', role: 'assistant', content: 'Provider-owned history.', createdAt: '2026-08-26T00:00:00.000Z',
    }]);

    const fenced = broker.begin<unknown[]>({
      ...OWNER,
      command: { kind: 'conversation.history', commandId: 'command-2', conversationId: 'conversation-2' },
    });
    const fencedExpectation = expect(fenced.result).rejects.toThrow('gateway_broker_fence_invalid');
    broker.resolveConversationHistory({ kind: 'conversation.history', commandId: 'command-2', conversationId: 'conversation-other', messages: [] });
    await fencedExpectation;
  });

  it('fences a live turn by organization, user, conversation, and turn while forwarding only bounded live events', async () => {
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const started = broker.beginTurnStart({ ...OWNER, commandId: 'command-1', conversationId: 'conversation-1', turnId: 'turn-1' });
    const events: unknown[] = [];
    const unsubscribe = broker.subscribeTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' }, (event) => events.push(event));

    expect(() => broker.subscribeTurn({ ...OWNER, initiatingUserId: '00000000-0000-4000-8000-000000000003', conversationId: 'conversation-1', turnId: 'turn-1' }, () => undefined))
      .toThrow('gateway_broker_fence_invalid');
    broker.publishTurnEvent('conversation-1', 'turn-1', { kind: 'status', status: 'started' });
    broker.publishTurnEvent('conversation-1', 'turn-1', { kind: 'assistant.delta', delta: 'Bounded provider delta.' });
    broker.publishTurnEvent('conversation-1', 'turn-1', { kind: 'status', status: 'completed' });
    unsubscribe();

    await expect(started.result).resolves.toBeUndefined();
    expect(events).toEqual([
      { kind: 'status', status: 'started' },
      { kind: 'assistant.delta', delta: 'Bounded provider delta.' },
      { kind: 'status', status: 'completed' },
    ]);
  });

  it('rejects bounded pending commands on timeout and disconnect without keeping a durable transcript or queue', async () => {
    vi.useFakeTimers();
    try {
      const broker = new GatewayCommandResponseBroker({ timeoutMs: 100 });
      const timedOut = broker.begin<void>({ ...OWNER, command: { kind: 'conversation.delete', commandId: 'command-1', conversationId: 'conversation-1' } });
      const timedOutExpectation = expect(timedOut.result).rejects.toThrow('gateway_command_timeout');
      await vi.advanceTimersByTimeAsync(100);
      await timedOutExpectation;

      const timedOutStart = broker.beginTurnStart({ ...OWNER, commandId: 'start-1', conversationId: 'conversation-1', turnId: 'turn-1' });
      const streamEvents: unknown[] = [];
      broker.subscribeTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' }, (event) => streamEvents.push(event));
      const timedOutStartExpectation = expect(timedOutStart.result).rejects.toThrow('gateway_command_timeout');
      await vi.advanceTimersByTimeAsync(100);
      await timedOutStartExpectation;
      expect(streamEvents).toEqual([{ kind: 'status', status: 'failed' }]);
      expect(() => broker.subscribeTurn({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' }, () => undefined))
        .toThrow('gateway_broker_fence_invalid');

      const disconnected = broker.begin<void>({ ...OWNER, command: { kind: 'conversation.delete', commandId: 'command-2', conversationId: 'conversation-1' } });
      const disconnectedExpectation = expect(disconnected.result).rejects.toThrow('gateway_command_disconnected');
      broker.disconnect();
      await disconnectedExpectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps preference result correlation live through acknowledgement until the exact loaded or updated event arrives', async () => {
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 }) as GatewayCommandResponseBroker & {
      resolvePreferenceLoaded(event: {
        kind: 'conversation.preferences.loaded';
        commandId: string;
        preferences: typeof PREFERENCES;
      }): void;
      resolvePreferenceUpdated(event: {
        kind: 'conversation.preferences.updated';
        commandId: string;
        preferences: typeof PREFERENCES;
      }): void;
    };
    const loaded = broker.begin<typeof PREFERENCES>({
      ...OWNER,
      command: { kind: 'conversation.preferences.get', commandId: 'preferences-get' },
    });
    const updated = broker.begin<typeof PREFERENCES>({
      ...OWNER,
      command: {
        kind: 'conversation.preferences.set',
        commandId: 'preferences-set',
        context: 'general',
        runtime: 'codex_cli',
        model: 'gpt-5.6',
        reasoningEffort: 'low',
      },
    });

    broker.acknowledge('preferences-get');
    broker.acknowledge('preferences-set');
    broker.resolvePreferenceLoaded({
      kind: 'conversation.preferences.loaded',
      commandId: 'preferences-get',
      preferences: PREFERENCES,
    });
    broker.resolvePreferenceUpdated({
      kind: 'conversation.preferences.updated',
      commandId: 'preferences-set',
      preferences: PREFERENCES,
    });

    await expect(loaded.result).resolves.toEqual(PREFERENCES);
    await expect(updated.result).resolves.toEqual(PREFERENCES);
  });
});
