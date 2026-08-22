export const AGENT_SESSION_DELETION_EXECUTION_PORT = Symbol(
  "AGENT_SESSION_DELETION_EXECUTION_PORT",
);

export type AgentSessionDeletionExecutionResult =
  | { kind: "ready_for_graph_delete"; closureDigest: string }
  | { kind: "retryable"; code: AgentSessionDeletionFailureCode; consumedAttempts: number };

export interface AgentSessionDeletionExecutionPort {
  execute(input: ScopedDeletionAttempt): Promise<AgentSessionDeletionExecutionResult>;
}
import type {
  AgentSessionDeletionFailureCode,
  ScopedDeletionAttempt,
} from '../../out/transaction/session-deletion/agent-session-deletion-execution.transaction.port';
