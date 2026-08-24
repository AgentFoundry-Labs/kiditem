export const LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT = Symbol(
  'LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT',
);

export interface LiveAttemptRuntimeProfile {
  model: string;
  loginHome: string;
}

export interface LiveAttemptMcpBinding {
  attemptId: string;
  sessionId: string;
  taskId: string;
  agentVersionId: string;
  organizationId: string;
  userId: string;
  capabilityKeys: readonly string[];
}

export interface LiveAttemptExecutionCapabilityPort {
  start(input: {
    attemptId: string;
    runtime: 'codex_cli' | 'claude_cli';
    profile: LiveAttemptRuntimeProfile;
    prompt: string;
    instructionProfileRef?: string;
    mcp: LiveAttemptMcpBinding;
  }): Promise<unknown>;
  interrupt(attemptId: string): Promise<void>;
}
