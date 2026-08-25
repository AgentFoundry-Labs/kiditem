import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptLaunchSpec, RunnerCommandBatch, RunnerEvent } from '@kiditem/shared/agent-runtime';
import { RunnerControlHttpError } from './runner-control.client';
import { NativeRunnerControlSession, type RunnerControlTransport } from './native-runner-control-session';

const runnerInstanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const leaseId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';

afterEach(() => { vi.useRealTimers(); });

describe('NativeRunnerControlSession', () => {
  it('owns poll, dispatch, outbox acknowledgement, and fail-closed cleanup as one native Runner module', async () => {
    let successfulPoll: (() => void) | undefined;
    let polls = 0;
    const posted: unknown[] = [];
    const client: RunnerControlTransport = {
      poll: vi.fn(async (): Promise<RunnerCommandBatch | null> => {
        polls += 1;
        if (polls === 1) {
          successfulPoll?.();
          return { commands: [start()] };
        }
        throw new RunnerControlHttpError(401);
      }),
      postEventBody: vi.fn(async (body: string) => {
        const batch = JSON.parse(body) as { eventSeq: number };
        posted.push(JSON.parse(body));
        return { eventSeq: batch.eventSeq, accepted: true };
      }),
      onSuccessfulCommandPoll: (listener) => {
        successfulPoll = listener;
        return () => { successfulPoll = undefined; };
      },
      abortInFlight: vi.fn(),
    };
    const executor = execution();
    const protocol = new NativeRunnerControlSession({ client, runnerInstanceId, leaseId, executor });

    await expect(protocol.run()).rejects.toThrow('runner_lease_lost');

    expect(executor.start).toHaveBeenCalledWith(start().launch);
    expect(executor.interrupt).toHaveBeenCalledWith(attemptId);
    expect(executor.shutdown).toHaveBeenCalledOnce();
    expect(posted).toHaveLength(1);
    expect((posted[0] as { events: Array<{ kind: string }> }).events.map((event) => event.kind))
      .toEqual(['command_ack', 'attempt.started']);
  });

  it('uses the module-owned absolute control-loss deadline to abort I/O and terminate local work', async () => {
    vi.useFakeTimers();
    const client: RunnerControlTransport = {
      poll: vi.fn(() => new Promise<RunnerCommandBatch | null>(() => undefined)),
      postEventBody: vi.fn(async () => ({ eventSeq: 1, accepted: true })),
      onSuccessfulCommandPoll: () => () => undefined,
      abortInFlight: vi.fn(),
    };
    const executor = execution();
    const protocol = new NativeRunnerControlSession({ client, runnerInstanceId, leaseId, executor });
    const running = protocol.run();
    void running.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(running).rejects.toThrow('runner_lease_lost');
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(executor.shutdown).toHaveBeenCalledOnce();
  });

  it('does not let continuous event delivery renew a black-holed command-poll lease', async () => {
    vi.useFakeTimers();
    let successfulPoll: (() => void) | undefined;
    let polls = 0;
    const client: RunnerControlTransport = {
      poll: vi.fn(() => {
        polls += 1;
        if (polls === 1) {
          successfulPoll?.();
          return Promise.resolve(null);
        }
        return new Promise<RunnerCommandBatch | null>(() => undefined);
      }),
      postEventBody: vi.fn(async () => ({ eventSeq: 1, accepted: true })),
      onSuccessfulCommandPoll: (listener) => {
        successfulPoll = listener;
        return () => { successfulPoll = undefined; };
      },
      abortInFlight: vi.fn(),
    };
    const executor = execution();
    const protocol = new NativeRunnerControlSession({ client, runnerInstanceId, leaseId, executor });
    const running = protocol.run();
    void running.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    for (let eventSeq = 1; eventSeq <= 5; eventSeq += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      await client.postEventBody(JSON.stringify({ eventSeq }));
    }
    await vi.advanceTimersByTimeAsync(5_000);

    expect(client.abortInFlight).toHaveBeenCalledOnce();
    await expect(running).rejects.toThrow('runner_lease_lost');
    expect(executor.shutdown).toHaveBeenCalledOnce();
  });

  it('holds a failed event outbox ahead of polling or redispatch and fails closed at the control deadline', async () => {
    vi.useFakeTimers();
    let successfulPoll: (() => void) | undefined;
    let polls = 0;
    const posted: string[] = [];
    const client: RunnerControlTransport = {
      poll: vi.fn(() => {
        polls += 1;
        if (polls <= 2) {
          successfulPoll?.();
          return Promise.resolve({ commands: [start()] });
        }
        return new Promise<RunnerCommandBatch | null>(() => undefined);
      }),
      postEventBody: vi.fn(async (body: string) => {
        posted.push(body);
        throw new RunnerControlHttpError(503);
      }),
      onSuccessfulCommandPoll: (listener) => {
        successfulPoll = listener;
        return () => { successfulPoll = undefined; };
      },
      abortInFlight: vi.fn(),
    };
    const executor = execution();
    const protocol = new NativeRunnerControlSession({
      client,
      runnerInstanceId,
      leaseId,
      executor,
      flushIntervalMs: 10_000,
    });
    const running = protocol.run();
    void running.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(0);
    protocol.emit({ kind: 'attempt.terminal', attemptId, terminalReason: 'success' });
    await vi.advanceTimersByTimeAsync(1_000);

    const outbox = (protocol as unknown as { outbox: { events: RunnerEvent[] } }).outbox;
    expect(polls).toBe(1);
    expect(executor.start).toHaveBeenCalledOnce();
    expect(outbox.events).toContainEqual({ kind: 'attempt.terminal', attemptId, terminalReason: 'success' });
    expect(outbox.events.filter((event) => event.kind === 'command_ack')).toHaveLength(1);
    expect(posted.length).toBeGreaterThan(0);
    expect(new Set(posted).size).toBe(1);

    await vi.advanceTimersByTimeAsync(29_000);

    await expect(running).rejects.toThrow('runner_lease_lost');
    expect(client.abortInFlight).toHaveBeenCalledOnce();
    expect(executor.shutdown).toHaveBeenCalledOnce();
  });

  it('leaves main as configuration and process-signal adapter rather than a second control-loop owner', () => {
    const source = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');

    expect(source).toContain('NativeRunnerControlSession');
    expect(source).not.toContain('RunnerCommandDispatcher');
    expect(source).not.toContain('RunnerEventOutbox');
    expect(source).not.toContain('RunnerControlLoop');
  });

  it('keeps the HTTP client as a transport adapter rather than a second native control owner', () => {
    const source = readFileSync(resolve(__dirname, 'runner-control.client.ts'), 'utf8');

    expect(source).not.toContain('RunnerControlLoop');
    expect(source).not.toContain('RunnerControlLossDeadline');
  });
});

function execution() {
  return {
    start: vi.fn(async (_launch: AttemptLaunchSpec) => undefined),
    input: vi.fn(async () => undefined),
    interrupt: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
  };
}

function start() {
  return {
    kind: 'attempt.start' as const,
    commandId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
    attemptId,
    deadlineAt: '2099-08-25T00:10:00.000Z',
    commandHash: 'a'.repeat(64),
    launch: {
      attemptId,
      runtime: 'codex_cli' as const,
      model: 'gpt-5.6',
      prompt: 'Return a bounded result.',
      workspacePolicy: 'empty_ephemeral_v1' as const,
      timeoutMs: 60_000,
      mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${attemptId}/mcp`,
      attemptToken: 'A'.repeat(43),
      mcpToolScope: 'business' as const,
      mcpProtocolRevision: '2026-07-28' as const,
      cliContractIdentity: 'office-cli-contract-v2' as const,
    },
  };
}
