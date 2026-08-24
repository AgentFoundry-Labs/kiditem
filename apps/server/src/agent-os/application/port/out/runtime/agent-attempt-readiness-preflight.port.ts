import type {
  AdmitAttemptInput,
  AdmitRootAttemptInput,
  DelegateTaskInput,
} from '../work/agent-work-transaction.port';

/** Exact Runner tuple validation before a durable Attempt admission begins. */
export interface AgentAttemptReadinessPreflightPort {
  assertRoot(input: AdmitRootAttemptInput): Promise<void>;
  assertFollowUp(input: AdmitAttemptInput): Promise<void>;
  assertDelegation(input: DelegateTaskInput): Promise<void>;
}
