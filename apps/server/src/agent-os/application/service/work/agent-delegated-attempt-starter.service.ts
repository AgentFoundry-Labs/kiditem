import type { LiveAttemptExecutionCapabilityPort } from '../../port/in/capability/live-attempt-execution.capability.port';
import type { AgentWorkTransactionPort } from '../../port/out/work/agent-work-transaction.port';

/**
 * Starts a newly admitted delegated Attempt through the capability boundary.
 * It deliberately knows neither a concrete runtime adapter nor an API module.
 */
export class AgentDelegatedAttemptStarterService {
  constructor(
    private readonly execution: Pick<LiveAttemptExecutionCapabilityPort, 'start'>,
    private readonly work: Pick<AgentWorkTransactionPort, 'transitionAttempt'>,
    private readonly admissions: { releaseAttempt(attemptId: string): void },
  ) {}

  async start(input: {
    attemptId: string;
    sessionId: string;
    taskId: string;
    agentVersionId: string;
    organizationId: string;
    userId: string;
    agentKey: string;
    runtime: string;
    capabilityKeys: readonly string[];
    prompt: string;
    /** Exact resolved target model persisted at child admission. */
    model?: string;
    instructionProfileRef: string;
  }): Promise<void> {
    try {
      if (input.runtime !== 'codex_cli' && input.runtime !== 'claude_cli') throw new Error('attempt_runtime_not_supported');
      const model = input.model?.trim();
      if (!model) throw new Error(`missing_required_configuration:AGENT_${input.agentKey.toUpperCase()}_MODEL`);
      await this.execution.start({
        attemptId: input.attemptId,
        runtime: input.runtime,
        profile: { model },
        prompt: input.prompt,
        instructionProfileRef: input.instructionProfileRef,
        mcp: {
          attemptId: input.attemptId, sessionId: input.sessionId, taskId: input.taskId,
          agentVersionId: input.agentVersionId, organizationId: input.organizationId,
          userId: input.userId, capabilityKeys: [...input.capabilityKeys],
        },
      });
    } catch (error) {
      // Config failures happen before the Host Runner queue owns the
      // Attempt, so terminalize/release here rather than leaking a `starting`
      // row and its admission slot.
      await this.failBeforeStart({
        attemptId: input.attemptId,
        code: 'attempt_start_failed',
        message: error instanceof Error ? error.message.slice(0, 1_000) : 'Attempt failed to start.',
      });
      throw error;
    }
  }

  /** Releases a child that could not obtain its durable grant before launch. */
  async failBeforeStart(input: { attemptId: string; code: string; message: string }): Promise<void> {
    try {
      await this.work.transitionAttempt({
        attemptId: input.attemptId, from: 'starting', to: 'failed', at: new Date(),
        error: { code: input.code, message: input.message.slice(0, 1_000) },
      });
    } finally { this.admissions.releaseAttempt(input.attemptId); }
  }
}
