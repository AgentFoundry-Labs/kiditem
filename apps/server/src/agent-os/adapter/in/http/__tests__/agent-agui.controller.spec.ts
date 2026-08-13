import 'reflect-metadata';
import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentAguiController } from '../agent-agui.controller';
import { InteractionGatewayGuard } from '../interaction-gateway.guard';

describe('AgentAguiController', () => {
  it('is a private gateway-guarded AG-UI route', () => {
    expect(Reflect.getMetadata('path', AgentAguiController)).toBe('agent-os/ag-ui');
    expect(Reflect.getMetadata('__guards__', AgentAguiController)).toContain(InteractionGatewayGuard);
  });

  it('streams official events as SSE and disconnect only closes the iterator', async () => {
    let returned = false;
    const runner = {
      run: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          try { yield { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' }; }
          finally { returned = true; }
        },
      })),
      stop: vi.fn(),
    };
    const controller = new AgentAguiController(runner as never, {} as never, {} as never);
    let close: (() => void) | undefined;
    const request = { once: vi.fn((name, callback) => { if (name === 'close') close = callback; }) };
    const response = {
      setHeader: vi.fn(),
      write: vi.fn(() => close?.()),
      end: vi.fn(),
    };

    await controller.run('operator', {
      threadId: 'thread-1', runId: 'run-1', state: {}, messages: [], tools: [], context: [], forwardedProps: {},
    } as never, request as never, response as never);

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(runner.stop).not.toHaveBeenCalled();
    expect(returned).toBe(true);
  });

  it('subscribes before authoritative catch-up so live join has no replay race', async () => {
    const calls: string[] = [];
    const repository = {
      readConversationEvents: vi.fn(async () => {
        calls.push('read');
        return {
          events: [{
            id: 'event-2', organizationId: 'org-1', sessionId: 'session-1',
            executionId: 'execution-1', externalEventId: 'assistant-1', sequence: 2n,
            eventType: 'assistant_message', schemaVersion: 1,
            payload: { messageId: 'assistant-1', content: 'durable answer' },
            createdAt: new Date('2026-08-14T00:00:00.000Z'),
          }],
          lastSequence: 2n,
          hasMore: false,
        };
      }),
    };
    const publisher = {
      subscribe: vi.fn(() => {
        calls.push('subscribe');
        return vi.fn();
      }),
    };
    let close: (() => void) | undefined;
    const request = { once: vi.fn((name, callback) => { if (name === 'close') close = callback; }) };
    const controller = new AgentAguiController(
      {} as never,
      {} as never,
      repository as never,
      publisher as never,
    );
    const events = (controller as never as {
      liveEvents(authorization: unknown, request: unknown): AsyncIterable<unknown>;
    }).liveEvents({
      organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1',
      copilotThreadId: 'thread-1', afterSequence: 1n,
    }, request);
    const iterator = events[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.TEXT_MESSAGE_CHUNK, delta: 'durable answer' },
    });
    expect(calls.slice(0, 2)).toEqual(['subscribe', 'read']);
    close?.();
    await iterator.return?.();
  });
});
