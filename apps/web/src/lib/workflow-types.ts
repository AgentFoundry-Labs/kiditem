// ============================================
// Workflow API Types (backend DTO mapping)
// ============================================

export interface WorkflowTemplate {
  id: string;
  companyId: string | null;
  name: string;
  description: string;
  module: string;
  isActive: boolean;
  triggerType: string;
  schedule: string | null;
  nodesJson: any;
  edgesJson: any;
  version: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  companyId: string | null;
  templateId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggeredBy: string;
  contextData: Record<string, any> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkflowStepRun {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputData: Record<string, any> | null;
  outputData: Record<string, any> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StepStatusInfo {
  status: 'idle' | 'running' | 'success' | 'error';
  outputData?: Record<string, any> | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

/** Map backend step status to frontend display status */
export function mapStepStatus(
  backendStatus: string,
): 'idle' | 'running' | 'success' | 'error' {
  switch (backendStatus) {
    case 'completed':
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
