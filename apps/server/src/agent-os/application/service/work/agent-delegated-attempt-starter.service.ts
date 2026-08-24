import type { AgentAttemptLaunchCapabilityPort } from '../../port/in/capability/agent-attempt-launch.capability.port';

/**
 * Starts a newly admitted delegated Attempt through the one shared launch
 * lifecycle. It deliberately knows neither a concrete runtime adapter nor an
 * API module.
 */
export class AgentDelegatedAttemptStarterService {
  constructor(private readonly launch: AgentAttemptLaunchCapabilityPort) {}

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
      await this.launch.start({
        attemptId: input.attemptId,
        runtime: input.runtime,
        profile: { model },
        prompt: input.prompt,
        instructionProfileRef: input.instructionProfileRef,
        sessionId: input.sessionId,
        taskId: input.taskId,
        agentVersionId: input.agentVersionId,
        organizationId: input.organizationId,
        userId: input.userId,
        capabilityKeys: [...input.capabilityKeys],
      });
    } catch (error) {
      await this.launch.failBeforeStart({ attemptId: input.attemptId });
      throw error;
    }
  }

  /** Uses the common cleanup path for a child rejected before launch. */
  async failBeforeStart(input: { attemptId: string; code: string; message: string }): Promise<void> {
    await this.launch.failBeforeStart({ attemptId: input.attemptId });
  }
}
