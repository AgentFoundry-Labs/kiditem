import { describe, expect, it, vi } from 'vitest';
import { GatewayConversationAdapter } from './gateway-conversation.adapter';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
};

const PREFERENCES = {
  schemaVersion: 1 as const,
  contexts: {
    general: {
      codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' },
    },
  },
};

describe('GatewayConversationAdapter', () => {
  it('uses the command queue and response broker without exposing bindings or provider references', async () => {
    const order: string[] = [];
    const queue = {
      enqueue: vi.fn(() => order.push('enqueue')),
      enqueueTurnStart: vi.fn(() => order.push('enqueueTurnStart')),
      terminal: vi.fn(),
    };
    const broker = {
      nextCommandId: vi.fn().mockReturnValue('command-1'),
      begin: vi.fn(() => {
        order.push('begin');
        return { commandId: 'command-1', result: Promise.resolve([]) };
      }),
      beginTurnStart: vi.fn(() => {
        order.push('beginTurnStart');
        return { commandId: 'command-1', result: Promise.resolve(undefined) };
      }),
      subscribeTurn: vi.fn().mockReturnValue(() => undefined),
      reject: vi.fn(),
    };
    const readiness = {
      snapshot: vi.fn().mockReturnValue({ gatewayInstanceId: 'gateway-1', readiness: [] }),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, readiness as never);

    await expect(adapter.list(OWNER)).resolves.toEqual([]);
    const turn = adapter.start({
      ...OWNER,
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      message: 'Please inspect this.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    expect(queue.enqueue).toHaveBeenCalledWith({ kind: 'conversation.list', commandId: 'command-1' });
    expect(queue.enqueueTurnStart).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: OWNER.organizationId,
      initiatingUserId: OWNER.userId,
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      message: 'Please inspect this.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    }));
    expect(turn).toEqual(expect.objectContaining({ turnId: 'turn-1', ready: expect.any(Promise) }));
    expect(JSON.stringify(queue.enqueueTurnStart.mock.calls)).not.toContain('executionBinding');
    expect(order).toEqual(['begin', 'enqueue', 'beginTurnStart', 'enqueueTurnStart']);
  });

  it('revokes the live turn through the queue when the broker loses a start stream', async () => {
    const queue = { enqueue: vi.fn(), enqueueTurnStart: vi.fn(), terminal: vi.fn() };
    const broker = {
      nextCommandId: vi.fn().mockReturnValue('command-1'),
      begin: vi.fn(),
      beginTurnStart: vi.fn().mockReturnValue({ commandId: 'command-1', result: Promise.reject(new Error('gateway_command_disconnected')) }),
      subscribeTurn: vi.fn(),
      reject: vi.fn(),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, { snapshot: vi.fn() } as never);

    const turn = adapter.start({
      ...OWNER,
      conversationId: 'conversation-1', turnId: 'turn-1', message: 'One turn.', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await expect(turn.ready).rejects.toThrow('conversation_gateway_unavailable');
    await Promise.resolve();

    expect(queue.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1');
  });

  it('immediately closes the broker request and binding if queue emission fails after registration', () => {
    const queue = {
      enqueue: vi.fn(() => { throw new Error('gateway_command_backpressure'); }),
      enqueueTurnStart: vi.fn(() => { throw new Error('gateway_command_backpressure'); }),
      terminal: vi.fn(),
    };
    const broker = {
      nextCommandId: vi.fn().mockReturnValue('command-1'),
      begin: vi.fn().mockReturnValue({ commandId: 'command-1', result: Promise.reject(new Error('gateway_command_not_enqueued')) }),
      beginTurnStart: vi.fn().mockReturnValue({ commandId: 'command-1', result: Promise.reject(new Error('gateway_command_not_enqueued')) }),
      subscribeTurn: vi.fn(),
      reject: vi.fn(),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, { snapshot: vi.fn() } as never);

    void adapter.list(OWNER).catch(() => undefined);
    expect(() => adapter.start({
      ...OWNER,
      conversationId: 'conversation-1', turnId: 'turn-1', message: 'One turn.', model: 'gpt-5.6', reasoningEffort: 'low',
    })).toThrow('conversation_gateway_unavailable');

    expect(broker.reject).toHaveBeenCalledWith('command-1', 'gateway_command_not_enqueued');
    expect(queue.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1');
  });

  it('revokes the turn binding for explicit interrupt and browser-stream disconnect without sending another turn', async () => {
    const queue = { enqueue: vi.fn(), enqueueTurnStart: vi.fn(), terminal: vi.fn() };
    const broker = {
      nextCommandId: vi.fn().mockReturnValue('command-1'),
      begin: vi.fn().mockReturnValue({ commandId: 'command-1', result: Promise.resolve(undefined) }),
      beginTurnStart: vi.fn(),
      subscribeTurn: vi.fn(),
      reject: vi.fn(),
      terminal: vi.fn(),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, { snapshot: vi.fn() } as never);

    await adapter.interrupt({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });
    adapter.disconnect({ ...OWNER, conversationId: 'conversation-1', turnId: 'turn-1' });

    expect(queue.terminal).toHaveBeenNthCalledWith(1, 'conversation-1', 'turn-1');
    expect(queue.terminal).toHaveBeenNthCalledWith(2, 'conversation-1', 'turn-1');
    expect(broker.terminal).toHaveBeenCalledWith('conversation-1', 'turn-1', 'disconnected');
    expect(queue.enqueueTurnStart).not.toHaveBeenCalled();
  });

  it('keeps authenticated owner fencing in broker correlation while emitting preference wire commands with only business input', async () => {
    const queue = { enqueue: vi.fn(), enqueueTurnStart: vi.fn(), terminal: vi.fn() };
    const broker = {
      nextCommandId: vi.fn()
        .mockReturnValueOnce('command-preferences-get')
        .mockReturnValueOnce('command-preferences-set'),
      begin: vi.fn((input: { command: { commandId: string } }) => ({
        commandId: input.command.commandId,
        result: Promise.resolve(PREFERENCES),
      })),
      beginTurnStart: vi.fn(),
      subscribeTurn: vi.fn(),
      reject: vi.fn(),
      terminal: vi.fn(),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, { snapshot: vi.fn() } as never) as unknown as {
      preferences(input: typeof OWNER): Promise<typeof PREFERENCES>;
      setPreference(input: typeof OWNER & {
        context: 'general';
        runtime: 'codex_cli';
        model: string;
        reasoningEffort: string;
      }): Promise<typeof PREFERENCES>;
    };

    await expect(adapter.preferences(OWNER)).resolves.toEqual(PREFERENCES);
    await expect(adapter.setPreference({
      ...OWNER,
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    })).resolves.toEqual(PREFERENCES);

    expect(broker.begin).toHaveBeenNthCalledWith(1, {
      organizationId: OWNER.organizationId,
      initiatingUserId: OWNER.userId,
      command: { kind: 'conversation.preferences.get', commandId: 'command-preferences-get' },
    });
    expect(broker.begin).toHaveBeenNthCalledWith(2, {
      organizationId: OWNER.organizationId,
      initiatingUserId: OWNER.userId,
      command: {
        kind: 'conversation.preferences.set',
        commandId: 'command-preferences-set',
        context: 'general',
        runtime: 'codex_cli',
        model: 'gpt-5.6',
        reasoningEffort: 'low',
      },
    });
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, {
      kind: 'conversation.preferences.get', commandId: 'command-preferences-get',
    });
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, {
      kind: 'conversation.preferences.set',
      commandId: 'command-preferences-set',
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    expect(JSON.stringify(queue.enqueue.mock.calls)).not.toContain(OWNER.organizationId);
    expect(JSON.stringify(queue.enqueue.mock.calls)).not.toContain(OWNER.userId);
  });

  it('turns raw control and provider failures into a bounded unavailable facade error', async () => {
    const queue = { enqueue: vi.fn(), enqueueTurnStart: vi.fn(), terminal: vi.fn() };
    const broker = {
      nextCommandId: vi.fn().mockReturnValue('command-unavailable'),
      begin: vi.fn().mockReturnValue({
        commandId: 'command-unavailable',
        result: Promise.reject(new Error('provider thread private-reference-123 failed')),
      }),
      beginTurnStart: vi.fn(),
      subscribeTurn: vi.fn(),
      reject: vi.fn(),
      terminal: vi.fn(),
    };
    const adapter = new GatewayConversationAdapter(queue as never, broker as never, { snapshot: vi.fn() } as never);

    await expect(adapter.list(OWNER)).rejects.toThrow('conversation_gateway_unavailable');
  });
});
