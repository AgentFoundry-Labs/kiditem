export const AGENT_SESSION_DELETION_EXECUTION_PORT = Symbol(
  "AGENT_SESSION_DELETION_EXECUTION_PORT",
);

export type AgentSessionDeletionExecutionResult =
  | { kind: "completed" }
  | { kind: "retryable"; code: AgentSessionDeletionFailureCode; consumedAttempts: number };

export interface AgentSessionDeletionExecutionPort {
  execute(input: ScopedDeletionAttempt & {
    fallbackConsumedAttempts: number;
    enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
  }): Promise<AgentSessionDeletionExecutionResult>;
}
import type {
  AgentSessionDeletionFailureCode,
  ScopedDeletionAttempt,
} from '../../out/transaction/session-deletion/agent-session-deletion-execution.transaction.port';
