import type {
  AdmitAttemptInput,
  AdmitAttemptResult,
  AdmitRootAttemptInput,
  AdmitRootAttemptResult,
  ApprovalDecisionInput,
  ApprovalDecisionResult,
  TaskLifecycleTransitionInput,
  TaskLifecycleTransitionResult,
  TerminalSessionDeleteInput,
} from '../../out/work/agent-work-persistence.types';

export const AGENT_WORK_COMMAND_PORT = Symbol('AGENT_WORK_COMMAND_PORT');

/** HTTP-facing durable work commands. Implementation services stay internal. */
export interface AgentWorkCommandPort {
  root(input: AdmitRootAttemptInput): Promise<AdmitRootAttemptResult>;
  followUp(input: AdmitAttemptInput): Promise<AdmitAttemptResult>;
  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult>;
  transition(input: TaskLifecycleTransitionInput): Promise<TaskLifecycleTransitionResult>;
  delete(input: TerminalSessionDeleteInput): Promise<{ deleted: boolean }>;
}
