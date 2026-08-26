import { describe, expect, it, vi } from 'vitest';

describe('NativeGatewayControlSession', () => {
  it('claims the Nest control session before flushing startup readiness', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    outbox.enqueue({
      kind: 'gateway.readiness',
      readiness: [
        { runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' },
        { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
      ],
    });
    const calls: string[] = [];
    let polls = 0;
    const client = {
      poll: vi.fn(async () => {
        calls.push('poll');
        polls += 1;
        if (polls === 1) return { commands: [] };
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => {
        calls.push('event');
        return { eventSeq: JSON.parse(body).eventSeq, accepted: true as const };
      }),
      abortInFlight: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher: { dispatch: vi.fn(), clear: vi.fn() },
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(calls).toEqual(['poll', 'event', 'poll']);
  });

  it('serializes poll, dispatch, stable outbox acknowledgement, and process-local cleanup on control loss', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const dispatcher = { dispatch: vi.fn(async () => { outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' }); }), clear: vi.fn() };
    let polls = 0;
    const client = {
      poll: vi.fn(async () => {
        polls += 1;
        if (polls === 1) return { commands: [{ kind: 'conversation.list', commandId: 'command-1' }] };
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => ({ eventSeq: JSON.parse(body).eventSeq, accepted: true })),
      abortInFlight: vi.fn(),
    };
    const lost = vi.fn();
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: lost,
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(dispatcher.dispatch).toHaveBeenCalledOnce();
    expect(client.postEventBody).toHaveBeenCalledOnce();
    expect(dispatcher.clear).toHaveBeenCalledOnce();
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(lost).toHaveBeenCalledOnce();
  });

  it('terminates a running loop on manual shutdown instead of treating the aborted poll as retryable', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const client = {
      poll: vi.fn(() => new Promise<never>(() => undefined)),
      postEventBody: vi.fn(),
      abortInFlight: vi.fn(),
    };
    const dispatcher = { dispatch: vi.fn(), clear: vi.fn() };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });
    const running = session.run();
    await Promise.resolve();
    await session.shutdown();

    await expect(running).rejects.toThrow('gateway_control_stopped');
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(dispatcher.clear).toHaveBeenCalledOnce();
  });
});
