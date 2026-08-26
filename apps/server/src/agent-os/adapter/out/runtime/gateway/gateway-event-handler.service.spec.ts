import { describe, expect, it, vi } from 'vitest';
import { GatewayEventHandlerService } from './gateway-event-handler.service';

describe('GatewayEventHandlerService', () => {
  it('acknowledges retry-safe event sequences once, records exact readiness, and revokes a provider-exit turn', () => {
    const queue = { isLiveSession: vi.fn(() => true), acknowledge: vi.fn(), reject: vi.fn(), terminal: vi.fn() };
    const readiness = { update: vi.fn() };
    const broker = brokerPort();
    const handler = new GatewayEventHandlerService({ queue: queue as never, readiness: readiness as never, broker: broker as never });
    const batch = {
      gatewayInstanceId: 'gateway-1', eventSeq: 1,
      events: [
        { kind: 'command.ack', commandId: 'command-1' },
        { kind: 'turn.event', conversationId: 'conversation-1', turnId: 'turn-1', event: { kind: 'status', status: 'disconnected' } },
        {
          kind: 'gateway.readiness', readiness: [
            { runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' },
            { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
          ],
        },
      ],
    } as const;

    expect(handler.handle(batch)).toEqual({ eventSeq: 1, accepted: true });
    expect(handler.handle(batch)).toEqual({ eventSeq: 1, accepted: true });
    expect(queue.acknowledge).toHaveBeenCalledTimes(1);
    expect(queue.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1');
    expect(broker.acknowledge).toHaveBeenCalledWith('command-1');
    expect(broker.publishTurnEvent).toHaveBeenCalledWith('conversation-1', 'turn-1', { kind: 'status', status: 'disconnected' });
    expect(broker.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1', 'disconnected');
    expect(readiness.update).toHaveBeenCalledWith('gateway-1', batch.events[2].readiness);
    expect(() => handler.handle({ ...batch, eventSeq: 3 })).toThrow('gateway_event_sequence_invalid');
  });

  it('forwards every correlated conversation result and command rejection to the bounded broker', () => {
    const queue = { isLiveSession: vi.fn(() => true), acknowledge: vi.fn(), reject: vi.fn(), terminal: vi.fn() };
    const readiness = { update: vi.fn() };
    const broker = brokerPort();
    const handler = new GatewayEventHandlerService({ queue: queue as never, readiness: readiness as never, broker: broker as never });

    handler.handle({
      gatewayInstanceId: 'gateway-1', eventSeq: 1,
      events: [
        { kind: 'command.rejected', commandId: 'rejected-1', code: 'provider_error' },
        { kind: 'conversation.listed', commandId: 'list-1', conversations: [] },
        { kind: 'conversation.created', commandId: 'create-1', conversation: conversation('created') },
        { kind: 'conversation.history', commandId: 'history-1', conversationId: 'conversation-1', messages: [] },
        { kind: 'conversation.renamed', commandId: 'rename-1', conversation: conversation('renamed') },
        { kind: 'conversation.deleted', commandId: 'delete-1', conversationId: 'conversation-1' },
        {
          kind: 'conversation.preferences.loaded',
          commandId: 'preferences-get-1',
          preferences: {
            schemaVersion: 1,
            contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' } } },
          },
        },
        {
          kind: 'conversation.preferences.updated',
          commandId: 'preferences-set-1',
          preferences: {
            schemaVersion: 1,
            contexts: { advertising: { claude_cli: { model: 'claude-sonnet', reasoningEffort: 'high' } } },
          },
        },
        { kind: 'turn.terminal', conversationId: 'conversation-1', turnId: 'turn-1', status: 'completed' },
      ],
    });

    expect(broker.reject).toHaveBeenCalledWith('rejected-1', 'provider_error');
    expect(broker.resolveConversationListed).toHaveBeenCalledOnce();
    expect(broker.resolveConversationCreated).toHaveBeenCalledOnce();
    expect(broker.resolveConversationHistory).toHaveBeenCalledOnce();
    expect(broker.resolveConversationRenamed).toHaveBeenCalledOnce();
    expect(broker.resolveConversationDeleted).toHaveBeenCalledOnce();
    expect(broker.resolvePreferenceLoaded).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'conversation.preferences.loaded', commandId: 'preferences-get-1',
    }));
    expect(broker.resolvePreferenceUpdated).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'conversation.preferences.updated', commandId: 'preferences-set-1',
    }));
    expect(broker.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1', 'completed');
  });
});

function brokerPort() {
  return {
    acknowledge: vi.fn(),
    reject: vi.fn(),
    resolveConversationListed: vi.fn(),
    resolveConversationCreated: vi.fn(),
    resolveConversationHistory: vi.fn(),
    resolveConversationRenamed: vi.fn(),
    resolveConversationDeleted: vi.fn(),
    resolvePreferenceLoaded: vi.fn(),
    resolvePreferenceUpdated: vi.fn(),
    publishTurnEvent: vi.fn(),
    terminal: vi.fn(),
  };
}

function conversation(id: string) {
  return {
    id: `conversation-${id}`, runtime: 'codex_cli' as const, agentKey: null,
    title: 'Conversation', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  };
}
