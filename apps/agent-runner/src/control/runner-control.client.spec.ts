import { describe, expect, it } from 'vitest';
import { RunnerControlClient } from './runner-control.client';

const token = 'A'.repeat(43);
const runnerInstanceId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';

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

  it('notifies the native session only after a successful command poll, never an event post', async () => {
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token,
      fetch: async (url) => new URL(String(url)).pathname.endsWith('/events')
        ? new Response(JSON.stringify({ eventSeq: 1, accepted: true }), { status: 200 })
        : new Response(null, { status: 204 }),
    });
    let renewals = 0;
    const unsubscribe = client.onSuccessfulCommandPoll(() => { renewals += 1; });

    await client.postEventBody(JSON.stringify({ eventSeq: 1 }));
    expect(renewals).toBe(0);
    await client.poll({ kind: 'poll', runnerInstanceId, leaseId });
    expect(renewals).toBe(1);

    unsubscribe();
  });

  it('aborts a black-holed HTTP request when the native control session loses its lease', async () => {
    let signal: AbortSignal | undefined;
    const pending = deferredResponse();
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token,
      pollTimeoutMs: 60_000,
      fetch: async (_url, init) => {
        signal = init?.signal as AbortSignal;
        signal?.addEventListener('abort', () => pending.reject(signal?.reason), { once: true });
        return pending.promise;
      },
    });
    const poll = client.poll({ kind: 'poll', runnerInstanceId, leaseId });

    client.abortInFlight();

    expect(signal?.aborted).toBe(true);
    await expect(poll).rejects.toBeInstanceOf(Error);
  });
});

function deferredResponse(): { promise: Promise<Response>; reject: (reason?: unknown) => void } {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Response>((_resolve, rejectPromise) => { reject = rejectPromise; });
  return { promise, reject };
}
