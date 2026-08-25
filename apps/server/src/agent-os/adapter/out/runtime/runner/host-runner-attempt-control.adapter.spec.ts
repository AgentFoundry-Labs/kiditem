import { describe, expect, it } from 'vitest';
import type { HostRunnerControlAttemptPort } from './host-runner-control-session.module';
import { HostRunnerAttemptControlAdapter } from './host-runner-attempt-control.adapter';

const attemptId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';
const now = new Date('2026-08-25T00:00:00.000Z');

describe('HostRunnerAttemptControlAdapter', () => {
  it('validates a live message and delegates its delivery deadline to the control session', async () => {
    const inputs: Parameters<HostRunnerControlAttemptPort['sendInput']>[0][] = [];
    const control = controlRecorder({ inputs });
    const adapter = new HostRunnerAttemptControlAdapter({ control, now: () => now });

    await adapter.send({ attemptId, message: '  Continue with the next product.  ' });

    expect(inputs).toEqual([{
      attemptId,
      input: 'Continue with the next product.',
      deadlineAt: new Date('2026-08-25T00:30:00.000Z'),
    }]);
  });

  it('does not ask the control session to deliver an empty live message', async () => {
    const inputs: Parameters<HostRunnerControlAttemptPort['sendInput']>[0][] = [];
    const adapter = new HostRunnerAttemptControlAdapter({ control: controlRecorder({ inputs }), now: () => now });

    await expect(adapter.send({ attemptId, message: '   ' })).rejects.toThrow('attempt_input_invalid');

    expect(inputs).toEqual([]);
  });

  it('delegates interrupt token revocation and command idempotency to the control session', async () => {
    const interrupts: Parameters<HostRunnerControlAttemptPort['interrupt']>[0][] = [];
    const adapter = new HostRunnerAttemptControlAdapter({ control: controlRecorder({ interrupts }), now: () => now });

    await adapter.interrupt({ attemptId });

    expect(interrupts).toEqual([{
      attemptId,
      deadlineAt: new Date('2026-08-25T00:30:00.000Z'),
    }]);
  });
});

function controlRecorder(input: {
  inputs?: Parameters<HostRunnerControlAttemptPort['sendInput']>[0][];
  interrupts?: Parameters<HostRunnerControlAttemptPort['interrupt']>[0][];
}): Pick<HostRunnerControlAttemptPort, 'sendInput' | 'interrupt'> {
  return {
    sendInput(command) {
      input.inputs?.push(command);
      return {
        kind: 'attempt.input',
        commandId: '218f4eb1-9078-7a1e-9514-b19b5732f5de',
        attemptId: command.attemptId,
        input: command.input,
        deadlineAt: command.deadlineAt.toISOString(),
        commandHash: 'hash',
      };
    },
    interrupt(command) {
      input.interrupts?.push(command);
      return {
        kind: 'attempt.interrupt',
        commandId: '318f4eb1-9078-7a1e-9514-b19b5732f5de',
        attemptId: command.attemptId,
        deadlineAt: command.deadlineAt.toISOString(),
        commandHash: 'hash',
      };
    },
  };
}
