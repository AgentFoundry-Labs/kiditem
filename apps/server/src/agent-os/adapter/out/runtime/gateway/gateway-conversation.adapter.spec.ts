import { describe, expect, it, vi } from 'vitest';
import { GatewayConversationAdapter } from './gateway-conversation.adapter';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
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
    await expect(turn.ready).rejects.toThrow('gateway_command_disconnected');
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
    })).toThrow('gateway_command_backpressure');

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
});
