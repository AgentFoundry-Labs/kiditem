import type { AttemptRuntimeControlPort } from '../../../../application/port/out/runtime/attempt-runtime-control.port';
import type { HostRunnerControlAttemptPort } from './host-runner-control-session.module';
import { AguiRunIdSchema } from '@kiditem/shared/identifiers';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';

const CONTROL_COMMAND_TTL_MS = 30 * 60_000;

/**
 * Process-control Adapter. Validation remains here while the session owns
 * token revocation, command idempotency, and native Runner delivery.
 */
export class HostRunnerAttemptControlAdapter implements AttemptRuntimeControlPort {
  private readonly now: () => Date;

  constructor(private readonly options: {
    control: Pick<HostRunnerControlAttemptPort, 'sendInput' | 'interrupt'>;
    now?: () => Date;
  }) {
    this.now = options.now ?? (() => new Date());
  }

  async send(input: { attemptId: string; turnId: string; message: string }): Promise<void> {
    const message = input.message.trim();
    if (!message || message.length > 24_000) throw new Error('attempt_input_invalid');
    const turnId = parseTurnId(input.turnId);
    try {
      this.options.control.sendInput({
        attemptId: input.attemptId,
        turnId,
        input: message,
        deadlineAt: this.deadline(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'runner_input_command_conflict') {
        throw new AgentOsRuntimeError('runner_input_command_conflict');
      }
      throw error;
    }
  }

  async interrupt(input: { attemptId: string }): Promise<void> {
    await this.options.control.interrupt({
      attemptId: input.attemptId,
      deadlineAt: this.deadline(),
    });
  }

  private deadline(): Date {
    return new Date(this.now().getTime() + CONTROL_COMMAND_TTL_MS);
  }
}

function parseTurnId(value: string): string {
  const parsed = AguiRunIdSchema.safeParse(value);
  if (!parsed.success || !parsed.data.trim()) throw new Error('attempt_input_turn_invalid');
  return parsed.data;
}
