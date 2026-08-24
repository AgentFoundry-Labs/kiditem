import type { AttemptRuntimeControlPort } from '../../../../application/port/out/runtime/attempt-runtime-control.port';
import { RunnerCommandQueue } from './runner-command.queue';

const CONTROL_COMMAND_TTL_MS = 30 * 60_000;

/** Queues live Attempt intents for the sole native Host Runner consumer. */
export class RunnerAttemptRuntimeControlService implements AttemptRuntimeControlPort {
  private readonly now: () => Date;

  constructor(private readonly options: {
    commands: RunnerCommandQueue;
    tokens: { revokeAttempt(attemptId: string): void };
    now?: () => Date;
  }) {
    this.now = options.now ?? (() => new Date());
  }

  async send(input: { attemptId: string; message: string }): Promise<void> {
    const message = input.message.trim();
    if (!message || message.length > 24_000) throw new Error('attempt_input_invalid');
    this.options.commands.enqueueInput({
      attemptId: input.attemptId,
      input: message,
      deadlineAt: this.deadline(),
    });
  }

  async interrupt(input: { attemptId: string }): Promise<void> {
    this.options.tokens.revokeAttempt(input.attemptId);
    this.options.commands.enqueueInterrupt({
      attemptId: input.attemptId,
      deadlineAt: this.deadline(),
    });
  }

  private deadline(): Date {
    return new Date(this.now().getTime() + CONTROL_COMMAND_TTL_MS);
  }
}
