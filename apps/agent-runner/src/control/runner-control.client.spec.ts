import { describe, expect, it } from 'vitest';
import { RunnerControlClient, RunnerControlLoop } from './runner-control.client';

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

  it('immediately repolls an empty response and terminates all attempts after stale lease rejection', async () => {
    let polls = 0; let stopped = 0;
    const client = new RunnerControlClient({ controlOrigin: 'http://127.0.0.1:4000', token, fetch: async () => {
      polls += 1;
      return polls === 1 ? new Response(null, { status: 204 }) : new Response(null, { status: 401 });
    } });
    const loop = new RunnerControlLoop({ client, now: () => 0, sleep: async () => undefined });

    await expect(loop.run({ runnerInstanceId, leaseId, onCommands: async () => undefined, stopAll: async () => { stopped += 1; } })).rejects.toThrow('runner_lease_lost');
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

    await expect(loop.run({ runnerInstanceId, leaseId, onCommands: async () => undefined, stopAll: async () => { stopped += 1; } })).rejects.toThrow('runner_lease_lost');

    expect(polls).toBe(4);
    expect(sleeps).toEqual([100]);
    expect(stopped).toBe(1);
  });
});
