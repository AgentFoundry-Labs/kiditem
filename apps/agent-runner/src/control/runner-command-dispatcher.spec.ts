import { describe, expect, it } from 'vitest';
import type { AttemptLaunchSpec, RunnerStartCommand } from '@kiditem/shared/agent-runtime';
import { RunnerCommandDispatcher } from './runner-command-dispatcher';
import { RunnerEventOutbox } from './runner-event-outbox';

const attemptId = '33333333-3333-4333-8333-333333333333';
const commandId = '44444444-4444-4444-8444-444444444444';
const runnerInstanceId = '11111111-1111-4111-8111-111111111111';
const leaseId = '22222222-2222-4222-8222-222222222222';

describe('RunnerCommandDispatcher', () => {
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

  it('does not duplicate input or interrupt actions and rejects a terminal start replay', async () => {
    let inputs = 0; let interrupts = 0;
    const dispatcher = new RunnerCommandDispatcher({
      executor: { start: async () => undefined, input: async () => { inputs += 1; }, interrupt: async () => { interrupts += 1; } },
      outbox: new RunnerEventOutbox({ runnerInstanceId, leaseId }),
    });
    await dispatcher.dispatch(startCommand());
    const input = { kind: 'attempt.input' as const, commandId: '66666666-6666-4666-8666-666666666666', attemptId, deadlineAt: '2026-08-24T00:00:00.000Z', commandHash: 'c'.repeat(64), input: 'continue' };
    const interrupt = { kind: 'attempt.interrupt' as const, commandId: '77777777-7777-4777-8777-777777777777', attemptId, deadlineAt: '2026-08-24T00:00:00.000Z', commandHash: 'd'.repeat(64) };
    await dispatcher.dispatch(input); await dispatcher.dispatch(input);
    await dispatcher.dispatch(interrupt); await dispatcher.dispatch(interrupt);
    dispatcher.markTerminal(attemptId);
    await dispatcher.dispatch(startCommand());

    expect(inputs).toBe(1); expect(interrupts).toBe(1);
    expect(dispatcher.outbox.peekBody()).toContain('invalid_state');
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
});

function startCommand(overrides: Partial<Pick<RunnerStartCommand, 'attemptId' | 'commandId' | 'commandHash'>> = {}): RunnerStartCommand {
  const selectedAttemptId = overrides.attemptId ?? attemptId;
  return {
    kind: 'attempt.start', commandId: overrides.commandId ?? commandId, attemptId: selectedAttemptId, deadlineAt: '2026-08-24T00:00:00.000Z', commandHash: overrides.commandHash ?? 'a'.repeat(64),
    launch: {
      attemptId: selectedAttemptId, runtime: 'codex_cli', model: 'gpt-5.6', prompt: 'do not put this in an argument', timeoutMs: 10_000,
      workspacePolicy: 'empty_ephemeral_v1', mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${selectedAttemptId}/mcp`, attemptToken: 'A'.repeat(43),
      mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    },
  };
}
