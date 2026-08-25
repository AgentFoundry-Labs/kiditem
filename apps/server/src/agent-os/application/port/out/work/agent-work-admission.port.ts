import type {
  AdmitAttemptInput,
  AdmitAttemptResult,
  AdmitRootAttemptInput,
  AdmitRootAttemptResult,
  DelegateTaskInput,
  DelegateTaskResult,
} from "./agent-work-persistence.types";

export const AGENT_WORK_ADMISSION_PORT = Symbol("AGENT_WORK_ADMISSION_PORT");

/**
 * Durable admission and delegation seam. It owns all Session/Task/Attempt
 * creation ordering, idempotent delegation replay, and successor fencing.
 */
export interface AgentWorkAdmissionPort {
  admitRootAttempt(
    input: AdmitRootAttemptInput,
  ): Promise<AdmitRootAttemptResult>;
  /** Locks Session before Task and creates an immutable successor Attempt. */
  admitAttempt(input: AdmitAttemptInput): Promise<AdmitAttemptResult>;
  /** Fast exact replay lookup; delegateTask remains the atomic authority. */
  findDelegationReplay(
    input: Pick<
      DelegateTaskInput,
      | "organizationId"
      | "sessionId"
      | "parentTaskId"
      | "delegatingAttemptId"
      | "requestedByUserId"
      | "idempotencyKey"
      | "requestHash"
    >,
  ): Promise<DelegateTaskResult | null>;
  delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult>;
}
