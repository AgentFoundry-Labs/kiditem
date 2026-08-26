import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import { describe, expect, it, vi } from 'vitest';
import { GatewayCommandQueue } from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayEventHandlerService } from './gateway-event-handler.service';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
};

const POLL = {
  kind: 'poll' as const,
  gatewayInstanceId: 'gateway-1',
  platform: 'macos' as const,
  mcpTransportToken: 'A'.repeat(43),
  runtimeTrain: GATEWAY_RUNTIME_TRAIN,
};

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

  it('uses the first post-restart event sequence from the currently polled Gateway as a fresh in-memory baseline', () => {
    const queue = { isLiveSession: vi.fn(() => true), acknowledge: vi.fn(), reject: vi.fn(), terminal: vi.fn() };
    const broker = brokerPort();
    const handler = new GatewayEventHandlerService({
      queue: queue as never,
      readiness: { update: vi.fn() } as never,
      broker: broker as never,
    });

    expect(handler.handle({
      gatewayInstanceId: 'gateway-after-api-restart',
      eventSeq: 7,
      events: [{ kind: 'command.ack', commandId: 'command-after-restart' }],
    })).toEqual({ eventSeq: 7, accepted: true });
    expect(queue.acknowledge).toHaveBeenCalledWith('command-after-restart');
    expect(broker.acknowledge).toHaveBeenCalledWith('command-after-restart');
  });

  it('resolves a queued create through the event handler only when its returned conversation ID matches the owner-fenced command', async () => {
    const queue = new GatewayCommandQueue({
      runtime: mcpRuntime() as never,
      installationId: 'installation-1',
      longPollMs: 0,
    });
    queue.claim(POLL);
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const handler = new GatewayEventHandlerService({
      queue,
      readiness: { update: vi.fn() } as never,
      broker,
    });
    const command = {
      kind: 'conversation.create' as const,
      commandId: 'create-matching',
      conversationId: 'conversation-created',
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: 'Conversation',
    };
    const created = conversation('created');
    const matching = broker.begin<typeof created>({ ...OWNER, command });
    queue.enqueue(command);

    expect((await queue.poll(POLL)).commands).toEqual([command]);
    handler.handle({
      gatewayInstanceId: 'gateway-1',
      eventSeq: 1,
      events: [
        { kind: 'command.ack', commandId: command.commandId },
        { kind: 'conversation.created', commandId: command.commandId, conversation: created },
      ],
    });

    await expect(matching.result).resolves.toEqual(created);
    expect(await queue.poll(POLL)).toEqual({ commands: [] });

    const mismatchedCommand = {
      ...command,
      commandId: 'create-mismatched',
      conversationId: 'conversation-requested',
    };
    const mismatched = broker.begin<typeof created>({ ...OWNER, command: mismatchedCommand });
    const mismatchedExpectation = expect(mismatched.result).rejects.toThrow('gateway_broker_fence_invalid');
    queue.enqueue(mismatchedCommand);
    handler.handle({
      gatewayInstanceId: 'gateway-1',
      eventSeq: 2,
      events: [
        { kind: 'command.ack', commandId: mismatchedCommand.commandId },
        { kind: 'conversation.created', commandId: mismatchedCommand.commandId, conversation: created },
      ],
    });

    await mismatchedExpectation;
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

function mcpRuntime() {
  return {
    registerProcess: vi.fn(),
    activateTurn: vi.fn(),
    deactivateTurn: vi.fn(),
    disconnect: vi.fn(),
  };
}
