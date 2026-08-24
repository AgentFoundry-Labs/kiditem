import { describe, expect, it } from 'vitest';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerAttemptRuntimeControlService } from './runner-attempt-runtime-control.service';

const attemptId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerAttemptRuntimeControlService', () => {
  it('translates only live input and interrupt intents into Runner commands', async () => {
    let sequence = 0;
    const commands = new RunnerCommandQueue({
      commandId: () => `118f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`,
    });
    const tokens = { revokeAttempt: (_attemptId: string) => undefined };
    const control = new RunnerAttemptRuntimeControlService({
      commands,
      tokens,
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    });

    await control.send({ attemptId, message: 'continue with verified facts' });
    await control.interrupt({ attemptId });

    expect(commands.take().commands).toMatchObject([
      { kind: 'attempt.input', attemptId, input: 'continue with verified facts' },
      { kind: 'attempt.interrupt', attemptId },
    ]);
  });
});
