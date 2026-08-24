import type {
  AdmittedAttemptLaunchInput,
  AgentAttemptLaunchCapabilityPort,
} from '../../port/in/capability/agent-attempt-launch.capability.port';
import type { LiveAttemptExecutionCapabilityPort } from '../../port/in/capability/live-attempt-execution.capability.port';
import type { LiveAttemptFutureOutputCapabilityPort } from '../../port/in/capability/live-attempt-future-output.capability.port';
import type { AgentWorkTransactionPort } from '../../port/out/work/agent-work-transaction.port';

export interface AgentAttemptLaunchServiceOptions {
  now?: () => Date;
}

type PreStartCleanupStages = {
  attemptTerminalized: boolean;
  taskFinalized: boolean;
  outputFinished: boolean;
  capacityReleased: boolean;
};

const MAX_PRE_START_TRACKING = 1_024;

/**
 * Owns the non-process half of an admitted Attempt launch. A Host Runner
 * command either installs successfully or this boundary terminalizes the
 * durable Attempt and releases its process-local admission slot.
 */
export class AgentAttemptLaunchService implements AgentAttemptLaunchCapabilityPort {
  private readonly now: () => Date;
  private readonly preStartInFlight = new Map<string, Promise<void>>();
  private readonly preStartCompleted = new Set<string>();
  private readonly preStartStages = new Map<string, PreStartCleanupStages>();

  constructor(
    private readonly execution: Pick<LiveAttemptExecutionCapabilityPort, 'start'>,
    private readonly work: Pick<AgentWorkTransactionPort, 'transitionAttempt' | 'finalizeTaskFromAttempt'>,
    private readonly admissions: { releaseAttempt(attemptId: string): void },
    private readonly output: Pick<LiveAttemptFutureOutputCapabilityPort, 'bind' | 'finish'>,
    options: AgentAttemptLaunchServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async start(input: AdmittedAttemptLaunchInput): Promise<void> {
    if (this.preStartCompleted.has(input.attemptId)) throw new Error('attempt_terminal');
    try {
      if (input.output) {
        this.output.bind({
          attemptId: input.attemptId,
          threadId: input.output.threadId,
          runId: input.output.runId,
        });
      }
      await this.execution.start({
        attemptId: input.attemptId,
        runtime: input.runtime,
        profile: input.profile,
        prompt: input.prompt,
        ...(input.instructionProfileRef ? { instructionProfileRef: input.instructionProfileRef } : {}),
        ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
        mcp: {
          attemptId: input.attemptId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          agentVersionId: input.agentVersionId,
          organizationId: input.organizationId,
          userId: input.userId,
          capabilityKeys: input.capabilityKeys,
        },
      });
    } catch (error) {
      try {
        await this.failBeforeStart({ attemptId: input.attemptId });
      } catch {
        throw new Error('attempt_start_failed');
      }
      throw safeStartError(error);
    }
  }

  async failBeforeStart(input: { attemptId: string }): Promise<void> {
    if (this.preStartCompleted.has(input.attemptId)) return;
    const existing = this.preStartInFlight.get(input.attemptId);
    if (existing) return existing;
    const terminalization = this.terminalizeBeforeStart(input.attemptId);
    this.preStartInFlight.set(input.attemptId, terminalization);
    try {
      await terminalization;
      this.preStartCompleted.add(input.attemptId);
      this.preStartStages.delete(input.attemptId);
      if (this.preStartCompleted.size > MAX_PRE_START_TRACKING) {
        this.preStartCompleted.delete(this.preStartCompleted.values().next().value as string);
      }
    } finally {
      this.preStartInFlight.delete(input.attemptId);
    }
  }

  private async terminalizeBeforeStart(attemptId: string): Promise<void> {
    const stages = this.stagesFor(attemptId);
    const at = this.now();
    if (!stages.attemptTerminalized) {
      await this.work.transitionAttempt({
        attemptId,
        from: 'starting',
        to: 'failed',
        at,
        error: {
          code: 'attempt_start_failed',
          message: 'Attempt failed to start.',
        },
      });
      stages.attemptTerminalized = true;
    }
    if (!stages.taskFinalized) {
      await this.work.finalizeTaskFromAttempt({ attemptId, at });
      stages.taskFinalized = true;
    }
    if (!stages.outputFinished) {
      this.output.finish({ attemptId, outcome: 'failed' });
      stages.outputFinished = true;
    }
    if (!stages.capacityReleased) {
      this.admissions.releaseAttempt(attemptId);
      stages.capacityReleased = true;
    }
  }

  private stagesFor(attemptId: string): PreStartCleanupStages {
    const existing = this.preStartStages.get(attemptId);
    if (existing) return existing;
    if (this.preStartStages.size >= MAX_PRE_START_TRACKING) {
      throw new Error('attempt_start_backpressure');
    }
    const stages: PreStartCleanupStages = {
      attemptTerminalized: false,
      taskFinalized: false,
      outputFinished: false,
      capacityReleased: false,
    };
    this.preStartStages.set(attemptId, stages);
    return stages;
  }
}

const SAFE_START_FAILURE_CODES = new Set([
  'attempt_deadline_invalid',
  'attempt_instruction_profile_invalid',
  'attempt_prompt_invalid',
  'attempt_runtime_not_supported',
  'runner_command_backpressure',
  'runner_not_ready',
]);

function safeStartError(error: unknown): Error {
  const code = error instanceof Error ? error.message : '';
  return new Error(SAFE_START_FAILURE_CODES.has(code) ? code : 'attempt_start_failed');
}
