import type { WorkflowRunRecord } from '../persistence-records';

export const DETERMINISTIC_WORKFLOW_EXECUTION_PORT = Symbol(
  'DeterministicWorkflowExecutionPort',
);

export interface RunDeterministicWorkflowInput {
  templateId: string;
  organizationId: string;
  triggeredBy?: string;
  triggeredByUserId?: string | null;
  context?: Record<string, unknown>;
}

export type RunDeterministicWorkflowResult = WorkflowRunRecord;

export interface DeterministicWorkflowExecutionPort {
  run(input: RunDeterministicWorkflowInput): Promise<RunDeterministicWorkflowResult>;
}
