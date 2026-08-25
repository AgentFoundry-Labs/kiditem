import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnerControlClient, RunnerControlLoop } from './runner-control.client';

const token = 'A'.repeat(43);
const runnerInstanceId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';

afterEach(() => { vi.useRealTimers(); });

describe('RunnerControlClient', () => {
  it('uses header-only installation authentication and never puts the token in URL or body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new RunnerControlClient({ controlOrigin: 'http://127.0.0.1:4000', token, fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    } });
    await client.poll({ kind: 'poll', runnerInstanceId, leaseId });

    expect(calls[0]!.url).toBe('http://127.0.0.1:4000/internal/agent-runtime/runner/commands:poll');
    expect(calls[0]!.url).not.toContain(token);
    expect(String(calls[0]!.init.body)).not.toContain(token);
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe(`Bearer ${token}`);
  });

  it('immediately repolls an empty response and terminates all attempts after stale lease rejection', async () => {
    let polls = 0; let stopped = 0;
    const client = new RunnerControlClient({ controlOrigin: 'http://127.0.0.1:4000', token, fetch: async () => {
      polls += 1;
      return polls === 1 ? new Response(null, { status: 204 }) : new Response(null, { status: 401 });
    } });
    const loop = new RunnerControlLoop({ client, now: () => 0, sleep: async () => undefined });

    await expect(loop.run({ runnerInstanceId, leaseId, onCommands: async () => undefined, killAll: async () => { stopped += 1; } })).rejects.toThrow('runner_lease_lost');
    expect(polls).toBe(2); expect(stopped).toBe(1);
  });

  it('renews the thirty-second loss deadline after every successful poll', async () => {
    let polls = 0; let stopped = 0; let now = 0; const sleeps: number[] = [];
    const client = new RunnerControlClient({ controlOrigin: 'http://127.0.0.1:4000', token, fetch: async () => {
      polls += 1;
      if (polls === 1) return new Response(null, { status: 204 });
      if (polls === 2) { now = 29_000; return new Response(null, { status: 204 }); }
      if (polls === 3) { now = 31_000; throw new Error('transient_network_failure'); }
      return new Response(null, { status: 401 });
    } });
    const loop = new RunnerControlLoop({ client, now: () => now, sleep: async (milliseconds) => { sleeps.push(milliseconds); } });

    await expect(loop.run({ runnerInstanceId, leaseId, onCommands: async () => undefined, killAll: async () => { stopped += 1; } })).rejects.toThrow('runner_lease_lost');

    expect(polls).toBe(4);
    expect(sleeps).toEqual([100]);
    expect(stopped).toBe(1);
  });

  it('aborts a black-holed poll and kills every attempt at the absolute thirty-second control-loss deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let killed = 0;
    const deferred = deferredResponse();
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token,
      pollTimeoutMs: 60_000,
      fetch: async (_url, init) => {
        signal = init?.signal as AbortSignal;
        signal?.addEventListener('abort', () => deferred.reject(signal?.reason), { once: true });
        return deferred.promise;
      },
    });
    const loop = new RunnerControlLoop({ client });
    const running = loop.run({
      runnerInstanceId,
      leaseId,
      onCommands: async () => undefined,
      killAll: async () => { killed += 1; },
    });
    const rejected = expect(running).rejects.toThrow('runner_lease_lost');

    await vi.advanceTimersByTimeAsync(30_000);

    expect(signal?.aborted).toBe(true);
    await rejected;
    expect(killed).toBe(1);
  });

  it('does not let continuous valid event posts extend a black-holed command-poll lease', async () => {
    vi.useFakeTimers();
    let polls = 0;
    let signal: AbortSignal | undefined;
    let killed = 0;
    const deferred = deferredResponse();
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token,
      pollTimeoutMs: 60_000,
      fetch: async (url, init) => {
        if (new URL(String(url)).pathname.endsWith('/events')) {
          return new Response(JSON.stringify({ eventSeq: 1, accepted: true }), { status: 200 });
        }
        polls += 1;
        if (polls === 1) return new Response(null, { status: 204 });
        signal = init?.signal as AbortSignal;
        signal?.addEventListener('abort', () => deferred.reject(signal?.reason), { once: true });
        return deferred.promise;
      },
    });
    const loop = new RunnerControlLoop({ client });
    const running = loop.run({
      runnerInstanceId,
      leaseId,
      onCommands: async () => undefined,
      killAll: async () => { killed += 1; },
    });
    void running.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    for (let eventSeq = 1; eventSeq <= 5; eventSeq += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      await client.postEventBody(JSON.stringify({ eventSeq }));
    }
    await vi.advanceTimersByTimeAsync(5_000);

    expect(signal?.aborted).toBe(true);
    await expect(running).rejects.toThrow('runner_lease_lost');
    expect(killed).toBe(1);
  });

  it('aborts I/O once and exits without reconnecting when killAll itself fails at the deadline', async () => {
    vi.useFakeTimers();
    let calls = 0; let killed = 0; let signal: AbortSignal | undefined;
    const deferred = deferredResponse();
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token,
      pollTimeoutMs: 60_000,
      fetch: async (_url, init) => {
        calls += 1;
        signal = init?.signal as AbortSignal;
        signal?.addEventListener('abort', () => deferred.reject(signal?.reason), { once: true });
        return deferred.promise;
      },
    });
    const loop = new RunnerControlLoop({ client });
    const running = loop.run({
      runnerInstanceId,
      leaseId,
      onCommands: async () => undefined,
      killAll: async () => { killed += 1; throw new Error('runner_kill_all_failed'); },
    });
    void running.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(signal?.aborted).toBe(true);
    expect(killed).toBe(1);
    expect(calls).toBe(1);
    await expect(running).rejects.toThrow('runner_control_kill_all_failed');
  });
});

function deferredResponse(): { promise: Promise<Response>; reject: (reason?: unknown) => void } {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Response>((_resolve, rejectPromise) => { reject = rejectPromise; });
  return { promise, reject };
}
