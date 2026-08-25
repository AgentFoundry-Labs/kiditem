import type {
  AttemptLifecycleTransitionInput,
  FinalizeTaskFromAttemptInput,
  ReconciliationInput,
  ReconciliationResult,
  TaskLifecycleTransitionInput,
  TaskLifecycleTransitionResult,
  TerminalSessionDeleteInput,
} from "./agent-work-persistence.types";

export const AGENT_WORK_LIFECYCLE_PORT = Symbol("AGENT_WORK_LIFECYCLE_PORT");

/**
 * Durable Attempt/Task lifecycle seam. It owns terminalization, restart
 * recovery, quiescence checks, and terminal Session graph deletion.
 */
export interface AgentWorkLifecyclePort {
  reconcile(input: ReconciliationInput): Promise<ReconciliationResult>;
  transitionTask(
    input: TaskLifecycleTransitionInput,
  ): Promise<TaskLifecycleTransitionResult>;
  transitionAttempt(
    input: AttemptLifecycleTransitionInput,
  ): Promise<{ transitioned: boolean }>;
  /** Terminalizes business work only from a validated, quiescent Attempt. */
  finalizeTaskFromAttempt(
    input: FinalizeTaskFromAttemptInput,
  ): Promise<{ finalized: boolean; status: string | null }>;
  deleteTerminalSession(
    input: TerminalSessionDeleteInput,
  ): Promise<{ deleted: boolean }>;
}
