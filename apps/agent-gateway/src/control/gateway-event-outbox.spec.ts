import { describe, expect, it } from 'vitest';

describe('GatewayEventOutbox', () => {
  it('keeps one stable redacted batch until Nest acknowledges its exact sequence', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const installationBearer = 'A'.repeat(43);
    const mcpTransportToken = 'B'.repeat(43);
    const outbox = new GatewayEventOutbox({
      gatewayInstanceId: 'gateway-1',
      redactionTokens: [installationBearer, mcpTransportToken],
    });
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });
    outbox.enqueue({
      kind: 'turn.event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      event: { kind: 'assistant.delta', delta: `Never leak ${installationBearer} or ${mcpTransportToken}` },
    });

    const first = outbox.peekBody();
    expect(first).toContain('"eventSeq":1');
    expect(first).not.toContain(installationBearer);
    expect(first).not.toContain(mcpTransportToken);
    await expect(outbox.flush(async (body) => {
      expect(body).toBe(first);
      throw new Error('temporary transport loss');
    })).rejects.toThrow('temporary transport loss');
    expect(outbox.peekBody()).toBe(first);

    await outbox.flush(async (body) => ({ eventSeq: JSON.parse(body).eventSeq, accepted: true }));
    expect(outbox.peekBody()).toBeNull();
    expect(outbox.nextEventSeq()).toBe(2);
  });

  it('fails the control session instead of silently dropping an incoming assistant delta at protected capacity', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const failures: Error[] = [];
    outbox.onFailure((error: Error) => failures.push(error));

    for (let index = 0; index < 128; index += 1) {
      outbox.enqueue({ kind: 'command.ack', commandId: `command-${index}` });
    }
    const stable = outbox.peekBody();

    expect(() => outbox.enqueue({
      kind: 'turn.event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      event: { kind: 'assistant.delta', delta: 'A best-effort delta.' },
    })).toThrow('gateway_event_backpressure');

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: 'gateway_event_backpressure' });
    expect(outbox.peekBody()).toBe(stable);
  });

  it('fails the control session instead of evicting a retained assistant delta for a later terminal', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const failures: Error[] = [];
    outbox.onFailure((error: Error) => failures.push(error));

    for (let index = 0; index < 127; index += 1) {
      outbox.enqueue({ kind: 'command.ack', commandId: `command-${index}` });
    }
    outbox.enqueue({
      kind: 'turn.event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      event: { kind: 'assistant.delta', delta: 'Retained canonical delta.' },
    });
    const stable = outbox.peekBody();

    expect(() => outbox.enqueue({
      kind: 'turn.terminal',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      status: 'completed',
    })).toThrow('gateway_event_backpressure');

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: 'gateway_event_backpressure' });
    expect(outbox.peekBody()).toBe(stable);
  });
});
