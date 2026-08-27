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
        mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(calls).toEqual(['poll', 'event', 'poll']);
  });

  it('emits cached readiness for every fresh API runtime registration', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const readiness = [
      { runtime: 'codex_cli' as const, ready: false as const, code: 'gateway_provider_unavailable' as const },
      { runtime: 'claude_cli' as const, ready: false as const, code: 'gateway_provider_unavailable' as const },
    ];
    const calls: string[] = [];
    let polls = 0;
    const client = {
      poll: vi.fn(async () => {
        calls.push('poll');
        polls += 1;
        if (polls < 3) return { commands: [], apiRuntimeRegistered: true };
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => {
        calls.push('event');
        return { eventSeq: JSON.parse(body).eventSeq, accepted: true as const };
      }),
      abortInFlight: vi.fn(),
    };
    const dispatcher = {
      resetAfterApiRuntimeRegistration: vi.fn(async () => { calls.push('reset'); }),
      dispatch: vi.fn(),
      clear: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onApiRuntimeRegistered: () => {
        calls.push('readiness');
        outbox.enqueue({ kind: 'gateway.readiness', readiness });
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(calls).toEqual(['poll', 'reset', 'readiness', 'event', 'poll', 'reset', 'readiness', 'event', 'poll']);
    expect(client.postEventBody.mock.calls.map(([body]) => JSON.parse(body).events)).toEqual([
      [{ kind: 'gateway.readiness', readiness }],
      [{ kind: 'gateway.readiness', readiness }],
    ]);
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
        mcpTransportToken: 'A'.repeat(43),
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

  it('re-registers once after an API restart rejects a pending event before treating control as lost', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });
    const calls: string[] = [];
    let polls = 0;
    let events = 0;
    const client = {
      poll: vi.fn(async () => {
        calls.push('poll');
        polls += 1;
        if (polls < 3) return { commands: [] };
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => {
        calls.push('event');
        events += 1;
        if (events === 1) {
          throw new GatewayControlHttpError(409, 'gateway_process_registration_missing');
        }
        return { eventSeq: JSON.parse(body).eventSeq, accepted: true as const };
      }),
      abortInFlight: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher: { dispatch: vi.fn(), clear: vi.fn() },
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(calls).toEqual(['poll', 'event', 'poll', 'event', 'poll']);
    expect(client.postEventBody).toHaveBeenCalledTimes(2);
  });

  it('resets live provider turns before accepting commands after a fresh API runtime registration', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const order: string[] = [];
    let polls = 0;
    const client = {
      poll: vi.fn(async () => {
        polls += 1;
        if (polls === 1) return { commands: [], apiRuntimeRegistered: true };
        if (polls === 2) return { commands: [{ kind: 'conversation.list', commandId: 'command-1' }] };
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(),
      abortInFlight: vi.fn(),
    };
    const dispatcher = {
      resetAfterApiRuntimeRegistration: vi.fn(async () => { order.push('reset'); }),
      dispatch: vi.fn(async () => { order.push('dispatch'); }),
      clear: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(order).toEqual(['reset', 'dispatch']);
    expect(dispatcher.resetAfterApiRuntimeRegistration).toHaveBeenCalledOnce();
  });

  it('fails closed through the existing shutdown path when active-turn reset cannot stop a provider', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const resetFailure = new Error('provider_interrupt_failed');
    const onPollLoss = vi.fn();
    const dispatcher = {
      resetAfterApiRuntimeRegistration: vi.fn(async () => { throw resetFailure; }),
      dispatch: vi.fn(),
      clear: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client: {
        poll: vi.fn(async () => ({ commands: [], apiRuntimeRegistered: true })),
        postEventBody: vi.fn(),
        abortInFlight: vi.fn(),
      },
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss,
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(dispatcher.resetAfterApiRuntimeRegistration).toHaveBeenCalledOnce();
    expect(onPollLoss).toHaveBeenCalledOnce();
    expect(dispatcher.clear).toHaveBeenCalledOnce();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
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
        mcpTransportToken: 'A'.repeat(43),
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

  it('retains dispatcher turn fences until the provider shutdown path proves its process trees are gone', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const shutdownGate = deferred<void>();
    const dispatcher = { dispatch: vi.fn(), clear: vi.fn() };
    const session = new NativeGatewayControlSession({
      client: { poll: vi.fn(), postEventBody: vi.fn(), abortInFlight: vi.fn() },
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: () => shutdownGate.promise,
    });

    const shutdown = session.shutdown();
    await Promise.resolve();
    expect(dispatcher.clear).not.toHaveBeenCalled();

    shutdownGate.resolve();
    await shutdown;
    expect(dispatcher.clear).toHaveBeenCalledOnce();
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((resolvePromise) => { resolve = resolvePromise; }),
    resolve: (value: T) => resolve(value),
  };
}
