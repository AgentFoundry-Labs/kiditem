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
        if (polls === 1) return { commands: [{ kind: 'conversation.list', commandId: 'command-1', organizationId: 'organization-1' }] };
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
        if (polls === 1) return { commands: [] };
        if (polls === 2) return { commands: [], apiRuntimeRegistered: true as const };
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
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(calls).toEqual(['poll', 'event', 'poll', 'reset', 'event', 'poll']);
    expect(client.postEventBody).toHaveBeenCalledTimes(2);
  });

  it('drains an old long poll before freshly registering and retrying an exact rejected event body once', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const stalePollStarted = deferred<void>();
    const stalePollAborted = deferred<void>();
    const stalePoll = deferred<never>();
    const bodies: string[] = [];
    const calls: string[] = [];
    let polls = 0;
    const poll = {
      kind: 'poll' as const, gatewayInstanceId: 'gateway-1', platform: 'macos' as const,
      mcpTransportToken: 'A'.repeat(43),
      runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
    } as const;
    const client = {
      poll: vi.fn(() => {
        calls.push('poll');
        polls += 1;
        if (polls === 1 || polls === 3) return Promise.resolve({ commands: [], apiRuntimeRegistered: true as const });
        if (polls === 2) {
          stalePollStarted.resolve();
          return stalePoll.promise;
        }
        throw new GatewayControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => {
        calls.push('event');
        bodies.push(body);
        if (bodies.length === 1) {
          throw new GatewayControlHttpError(409, 'gateway_process_registration_missing');
        }
        return { eventSeq: JSON.parse(body).eventSeq, accepted: true as const };
      }),
      abortInFlight: vi.fn(() => {
        calls.push('abort');
        stalePollAborted.resolve();
      }),
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
      poll,
      onPollLoss: vi.fn(),
    });

    const running = session.run();
    const handledRunning = running.catch(() => undefined);
    await stalePollStarted.promise;
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });

    try {
      await settlesWithin(stalePollAborted.promise);
      expect(client.poll).toHaveBeenCalledTimes(2);
      stalePoll.reject(new Error('gateway_control_poll_aborted_for_registration_recovery'));

      await expect(settlesWithin(running)).rejects.toThrow('gateway_control_lost');
    } finally {
      stalePoll.reject(new Error('gateway_control_test_cleanup'));
      await session.shutdown();
      await handledRunning;
    }

    expect(calls).toEqual(['poll', 'reset', 'poll', 'event', 'abort', 'poll', 'reset', 'event', 'poll', 'abort']);
    expect(client.poll.mock.calls[2]).toEqual([poll]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(dispatcher.resetAfterApiRuntimeRegistration).toHaveBeenCalledTimes(2);
  });

  it('fails closed without retrying the event when the fresh recovery poll does not register', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const stalePollStarted = deferred<void>();
    const stalePoll = deferred<never>();
    let polls = 0;
    const client = {
      poll: vi.fn(() => {
        polls += 1;
        if (polls === 1) return Promise.resolve({ commands: [], apiRuntimeRegistered: true as const });
        if (polls === 2) {
          stalePollStarted.resolve();
          return stalePoll.promise;
        }
        return Promise.resolve({ commands: [] });
      }),
      postEventBody: vi.fn(async (body: string) => {
        throw new GatewayControlHttpError(409, 'gateway_process_registration_missing');
      }),
      abortInFlight: vi.fn(() => {
        stalePoll.reject(new Error('gateway_control_poll_aborted_for_registration_recovery'));
      }),
    };
    const dispatcher = {
      resetAfterApiRuntimeRegistration: vi.fn(async () => undefined),
      dispatch: vi.fn(),
      clear: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
    });

    const running = session.run();
    const handledRunning = running.catch(() => undefined);
    await stalePollStarted.promise;
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });

    try {
      await expect(settlesWithin(running)).rejects.toThrow('gateway_control_lost');
      expect(client.poll).toHaveBeenCalledTimes(3);
      expect(client.postEventBody).toHaveBeenCalledOnce();
      expect(dispatcher.resetAfterApiRuntimeRegistration).toHaveBeenCalledOnce();
    } finally {
      stalePoll.reject(new Error('gateway_control_test_cleanup'));
      await session.shutdown();
      await handledRunning;
    }
  });

  it('fails closed on an ordinary event-post failure without retrying the same batch', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });
    let eventPosts = 0;
    const sleep = vi.fn(async () => undefined);
    const client = {
      poll: vi.fn(async () => ({ commands: [] })),
      postEventBody: vi.fn(async () => {
        eventPosts += 1;
        if (eventPosts === 1) throw new Error('gateway_event_transport_lost');
        throw new GatewayControlHttpError(401);
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
      sleep,
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(client.postEventBody).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('makes a second event-post failure terminal after the one registration-missing recovery', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { GatewayControlHttpError } = await import('./gateway-control.client');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });
    let eventPosts = 0;
    let polls = 0;
    const sleep = vi.fn(async () => undefined);
    const client = {
      poll: vi.fn(async () => {
        polls += 1;
        return polls === 2 ? { commands: [], apiRuntimeRegistered: true as const } : { commands: [] };
      }),
      postEventBody: vi.fn(async () => {
        eventPosts += 1;
        if (eventPosts === 1) throw new GatewayControlHttpError(409, 'gateway_process_registration_missing');
        if (eventPosts === 2) throw new Error('gateway_event_transport_lost');
        throw new GatewayControlHttpError(401);
      }),
      abortInFlight: vi.fn(),
    };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher: { resetAfterApiRuntimeRegistration: vi.fn(async () => undefined), dispatch: vi.fn(), clear: vi.fn() },
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: vi.fn(),
      sleep,
    });

    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(client.poll).toHaveBeenCalledTimes(2);
    expect(client.postEventBody).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
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
        if (polls === 2) return { commands: [{ kind: 'conversation.list', commandId: 'command-1', organizationId: 'organization-1' }] };
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

  it('fails closed when assistant-delta backpressure occurs while an authenticated poll is active', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const pollStarted = deferred<void>();
    const onPollLoss = vi.fn();
    const client = {
      poll: vi.fn(() => {
        pollStarted.resolve();
        return new Promise<never>(() => undefined);
      }),
      postEventBody: vi.fn(),
      abortInFlight: vi.fn(),
    };
    const dispatcher = { dispatch: vi.fn(), clear: vi.fn() };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox,
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos',
        mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss,
    });

    const running = session.run();
    await pollStarted.promise;
    for (let index = 0; index < 128; index += 1) {
      outbox.enqueue({ kind: 'command.ack', commandId: `command-${index}` });
    }
    expect(() => outbox.enqueue({
      kind: 'turn.event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      event: { kind: 'assistant.delta', delta: 'Never silently truncate this turn.' },
    })).toThrow('gateway_event_backpressure');

    await expect(settlesWithin(running)).rejects.toThrow('gateway_control_lost');
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(onPollLoss).toHaveBeenCalledOnce();
    expect(dispatcher.clear).toHaveBeenCalledOnce();
  });

  it('posts a normal high-frequency assistant stream while an authenticated long poll remains active', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' });
    const pollStarted = deferred<void>();
    const eventPosted = deferred<void>();
    const onPollLoss = vi.fn();
    let polls = 0;
    const client = {
      poll: vi.fn(() => {
        polls += 1;
        if (polls === 1) {
          return Promise.resolve({ commands: [], apiRuntimeRegistered: true as const });
        }
        pollStarted.resolve();
        return new Promise<never>(() => undefined);
      }),
      postEventBody: vi.fn(async (body: string) => {
        eventPosted.resolve();
        return { eventSeq: JSON.parse(body).eventSeq, accepted: true as const };
      }),
      abortInFlight: vi.fn(),
    };
    const dispatcher = {
      resetAfterApiRuntimeRegistration: vi.fn(async () => undefined),
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
      onPollLoss,
    });

    const running = session.run();
    await pollStarted.promise;
    const fragments = Array.from({ length: 256 }, (_value, index) => `${index}:`);
    for (const fragment of fragments) {
      outbox.enqueue({
        kind: 'turn.event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        event: { kind: 'assistant.delta', delta: fragment },
      });
    }

    await settlesWithin(eventPosted.promise);
    expect(client.postEventBody).toHaveBeenCalledOnce();
    expect(JSON.parse(client.postEventBody.mock.calls[0]![0]).events).toEqual([{
      kind: 'turn.event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      event: { kind: 'assistant.delta', delta: fragments.join('') },
    }]);
    expect(client.poll).toHaveBeenCalledTimes(2);
    expect(client.abortInFlight).not.toHaveBeenCalled();

    await session.shutdown();
    await expect(running).rejects.toThrow('gateway_control_stopped');
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(onPollLoss).toHaveBeenCalledOnce();
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

  it('clears the dispatcher when provider shutdown rejects while preserving the original failure', async () => {
    const { GatewayEventOutbox } = await import('./gateway-event-outbox');
    const { NativeGatewayControlSession } = await import('./native-gateway-control-session');
    const failure = new Error('gateway_provider_tree_shutdown_failed');
    const dispatcher = { dispatch: vi.fn(), clear: vi.fn() };
    const client = { poll: vi.fn(), postEventBody: vi.fn(), abortInFlight: vi.fn() };
    const session = new NativeGatewayControlSession({
      client,
      dispatcher,
      outbox: new GatewayEventOutbox({ gatewayInstanceId: 'gateway-1' }),
      poll: {
        kind: 'poll', gatewayInstanceId: 'gateway-1', platform: 'macos', mcpTransportToken: 'A'.repeat(43),
        runtimeTrain: { controlRevision: 'kiditem-gateway-control-v1', mcpProtocolRevision: '2026-07-28', nodeMajor: 22, codexVersion: '0.149.1', claudeVersion: '2.1.245' },
      },
      onPollLoss: async () => { throw failure; },
    });

    await expect(session.shutdown()).rejects.toBe(failure);

    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(dispatcher.clear).toHaveBeenCalledOnce();
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  return {
    promise: new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    }),
    resolve: (value: T) => resolve(value),
    reject: (reason?: unknown) => reject(reason),
  };
}

async function settlesWithin<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('gateway_control_did_not_fail_closed')), 100);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
