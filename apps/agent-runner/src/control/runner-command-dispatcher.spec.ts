import { describe, expect, it } from 'vitest';
import type { AttemptLaunchSpec, RunnerStartCommand } from '@kiditem/shared/agent-runtime';
import { RunnerCommandDispatcher } from './runner-command-dispatcher';
import { RunnerEventOutbox } from './runner-event-outbox';

const attemptId = '33333333-3333-4333-8333-333333333333';
const commandId = '44444444-4444-4444-8444-444444444444';
const runnerInstanceId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';

describe('RunnerCommandDispatcher', () => {
  it('does not append a second acknowledgement when the exact command is redelivered before its first acknowledgement flushes', async () => {
    let starts = 0;
    const dispatcher = new RunnerCommandDispatcher({
      executor: {
        start: async () => { starts += 1; },
        input: async () => undefined,
        interrupt: async () => undefined,
      },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
    });
    const start = startCommand();

    await dispatcher.dispatch(start);
    dispatcher.outbox.peekBody();
    await dispatcher.dispatch(start);
    await dispatcher.outbox.flush(async (body) => ({ eventSeq: JSON.parse(body).eventSeq, accepted: true }));

    expect(starts).toBe(1);
    expect(dispatcher.outbox.peekBody()).toBeNull();
  });

  it('installs one start process and returns a conflict instead of starting a drifted duplicate', async () => {
    const starts: AttemptLaunchSpec[] = [];
    const dispatcher = new RunnerCommandDispatcher({
      executor: {
        start: async (launch) => { starts.push(launch); },
        input: async () => undefined,
        interrupt: async () => undefined,
      },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
    });
    const start = startCommand();

    await dispatcher.dispatch(start);
    await dispatcher.dispatch(start);
    await dispatcher.dispatch({ ...start, commandId: '55555555-5555-4555-8555-555555555555', commandHash: 'b'.repeat(64) });

    expect(starts).toHaveLength(1);
    expect(dispatcher.outbox.peekBody()).toContain('conflict');
  });

  it('does not duplicate expired live input or cleanup interrupt actions and rejects a terminal start replay', async () => {
    let inputs = 0; let interrupts = 0;
    const dispatcher = new RunnerCommandDispatcher({
      executor: { start: async () => undefined, input: async () => { inputs += 1; }, interrupt: async () => { interrupts += 1; } },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
      now: () => new Date('2099-08-24T00:00:00.001Z'),
    });
    await dispatcher.dispatch(startCommand());
    const input = { kind: 'attempt.input' as const, commandId: '66666666-6666-4666-8666-666666666666', attemptId, deadlineAt: '2026-08-24T00:00:00.000Z', commandHash: 'c'.repeat(64), input: 'continue' };
    const interrupt = { kind: 'attempt.interrupt' as const, commandId: '77777777-7777-4777-8777-777777777777', attemptId, deadlineAt: '2026-08-24T00:00:00.000Z', commandHash: 'd'.repeat(64) };
    await dispatcher.dispatch(input); await dispatcher.dispatch(input);
    await dispatcher.dispatch(interrupt); await dispatcher.dispatch(interrupt);
    dispatcher.markTerminal(attemptId);
    await dispatcher.dispatch(startCommand());

    expect(inputs).toBe(1); expect(interrupts).toBe(1);
    const events = JSON.parse(dispatcher.outbox.peekBody()!).events;
    expect(events.filter((event: { kind: string; commandId?: string }) =>
      event.kind === 'attempt.rejected' && [input.commandId, interrupt.commandId].includes(event.commandId),
    )).toEqual([]);
    expect(events).toContainEqual({ kind: 'attempt.rejected', commandId, attemptId, code: 'invalid_state' });
  });

  it('bounds live dispatcher state, rejects excess starts, and releases capacity after a terminal attempt', async () => {
    const starts: AttemptLaunchSpec[] = [];
    const dispatcher = new RunnerCommandDispatcher({
      executor: { start: async (launch) => { starts.push(launch); }, input: async () => undefined, interrupt: async () => undefined },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
      maxAttempts: 2,
    });
    const first = startCommand({ attemptId, commandId, commandHash: 'a'.repeat(64) });
    const second = startCommand({ attemptId: '88888888-8888-4888-8888-888888888888', commandId: '99999999-9999-4999-8999-999999999999', commandHash: 'b'.repeat(64) });
    const excess = startCommand({ attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', commandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', commandHash: 'c'.repeat(64) });

    await dispatcher.dispatch(first);
    await dispatcher.dispatch(second);
    await dispatcher.dispatch(excess);
    dispatcher.markTerminal(first.attemptId);
    await dispatcher.dispatch(excess);
    await dispatcher.dispatch(startCommand({ attemptId: first.attemptId, commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', commandHash: 'a'.repeat(64) }));

    expect(starts.map((start) => start.attemptId)).toEqual([first.attemptId, second.attemptId, excess.attemptId]);
    expect(dispatcher.outbox.peekBody()).toContain('unsupported');
    expect(dispatcher.outbox.peekBody()).toContain('invalid_state');
  });

  it('terminally rejects one permanent local start failure without letting it enter transport retry or starve later work', async () => {
    const starts: AttemptLaunchSpec[] = []; const localDetail = 'provider-local-detail-must-not-leak';
    const failed = startCommand({ attemptId, commandId, commandHash: 'a'.repeat(64) });
    const later = startCommand({
      attemptId: '88888888-8888-4888-8888-888888888888',
      commandId: '99999999-9999-4999-8999-999999999999',
      commandHash: 'b'.repeat(64),
    });
    const dispatcher = new RunnerCommandDispatcher({
      executor: {
        start: async (launch) => {
          starts.push(launch);
          if (launch.attemptId === failed.attemptId) throw new Error(localDetail);
        },
        input: async () => undefined,
        interrupt: async () => undefined,
      },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
    });

    await expect(dispatcher.dispatch(failed)).resolves.toBeUndefined();
    await dispatcher.dispatch(later);
    await dispatcher.dispatch(failed);
    await dispatcher.dispatch({ ...failed, commandHash: 'c'.repeat(64) });

    const events = JSON.parse(dispatcher.outbox.peekBody()!).events;
    expect(starts.map((launch) => launch.attemptId)).toEqual([failed.attemptId, later.attemptId]);
    expect(events.filter((event: { kind: string }) => event.kind === 'attempt.rejected')).toEqual([
      { kind: 'attempt.rejected', commandId: failed.commandId, attemptId: failed.attemptId, code: 'unsupported' },
      { kind: 'attempt.rejected', commandId: failed.commandId, attemptId: failed.attemptId, code: 'conflict' },
    ]);
    expect(events).toContainEqual({ kind: 'attempt.started', attemptId: later.attemptId });
    expect(JSON.stringify(events)).not.toContain(localDetail);
  });

  it('rejects an expired start before local execution and leaves a later command dispatchable', async () => {
    const starts: AttemptLaunchSpec[] = [];
    const expired = { ...startCommand(), deadlineAt: '2099-08-24T00:00:00.000Z' };
    const later = startCommand({
      attemptId: '88888888-8888-4888-8888-888888888888',
      commandId: '99999999-9999-4999-8999-999999999999',
      commandHash: 'b'.repeat(64),
    });
    const options = Object.assign({
      executor: { start: async (launch: AttemptLaunchSpec) => { starts.push(launch); }, input: async () => undefined, interrupt: async () => undefined },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
    }, { now: () => new Date('2099-08-24T00:00:00.001Z') });
    const dispatcher = new RunnerCommandDispatcher(options);

    await expect(dispatcher.dispatch(expired)).resolves.toBeUndefined();
    await dispatcher.dispatch(later);
    await dispatcher.dispatch(expired);

    const events = JSON.parse(dispatcher.outbox.peekBody()!).events;
    expect(starts.map((launch) => launch.attemptId)).toEqual([later.attemptId]);
    expect(events.filter((event: { kind: string }) => event.kind === 'attempt.rejected')).toEqual([
      { kind: 'attempt.rejected', commandId: expired.commandId, attemptId: expired.attemptId, code: 'unsupported' },
    ]);
    expect(events).toContainEqual({ kind: 'attempt.started', attemptId: later.attemptId });
  });
});

function startCommand(overrides: Partial<Pick<RunnerStartCommand, 'attemptId' | 'commandId' | 'commandHash'>> = {}): RunnerStartCommand {
  const selectedAttemptId = overrides.attemptId ?? attemptId;
  return {
    kind: 'attempt.start', commandId: overrides.commandId ?? commandId, attemptId: selectedAttemptId, deadlineAt: '2099-08-24T00:01:00.000Z', commandHash: overrides.commandHash ?? 'a'.repeat(64),
    launch: {
      attemptId: selectedAttemptId, runtime: 'codex_cli', model: 'gpt-5.6', prompt: 'do not put this in an argument', timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1', mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${selectedAttemptId}/mcp`, attemptToken: 'A'.repeat(43),
      mcpToolScope: 'business', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    },
  };
}
