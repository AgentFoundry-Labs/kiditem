export const WORKFLOW_RUN_CANCELLATION_PORT = Symbol(
  'WorkflowRunCancellationPort',
);

export interface CancelWorkflowRunInput {
  organizationId: string;
  runId: string;
  actorUserId: string | null;
  reason?: string;
}

export interface CancelWorkflowRunResult {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  workflowRunId: string;
  cancelledAgentRunRequests: number;
  cancelledAgentRuns: number;
}

export interface WorkflowRunCancellationPort {
  cancelRun(input: CancelWorkflowRunInput): Promise<CancelWorkflowRunResult>;
}
