import type {
  LiveAttemptExecutionCapabilityPort,
  LiveAttemptMcpBinding,
} from './live-attempt-execution.capability.port';

export const AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT = Symbol(
  'AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT',
);

export type AdmittedAttemptLaunchInput = Omit<
  Parameters<LiveAttemptExecutionCapabilityPort['start']>[0],
  'mcp'
> & LiveAttemptMcpBinding & {
  output?: { threadId: string; runId: string };
};

/** One lifecycle boundary for a durable, already-admitted Attempt launch. */
export interface AgentAttemptLaunchCapabilityPort {
  start(input: AdmittedAttemptLaunchInput): Promise<void>;
  failBeforeStart(input: { attemptId: string }): Promise<void>;
}
