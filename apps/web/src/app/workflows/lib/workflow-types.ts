// ============================================
// Workflow API Types (backend DTO mapping)
// ============================================

export type { WorkflowTemplate, WorkflowRun } from '@kiditem/shared';
import type { WorkflowRun, WorkflowStepRun } from '@kiditem/shared';

export interface StepStatusInfo {
  status: 'idle' | 'running' | 'success' | 'error';
  outputData?: Record<string, any> | null;
  error?: string | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
}

/** Map backend step status to frontend display status */
export function mapStepStatus(
  backendStatus: string,
): 'idle' | 'running' | 'success' | 'error' {
  switch (backendStatus) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
      return 'running';
    default:
      return 'idle';
  }
}

export type WorkflowRunWithSteps = WorkflowRun & {
  steps: WorkflowStepRun[];
};
