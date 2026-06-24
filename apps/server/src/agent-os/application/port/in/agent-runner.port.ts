export const AGENT_RUNNER_PORT = Symbol('AGENT_RUNNER_PORT');

export interface AgentRunnerInput {
  organizationId: string;
  taskKey?: string;
  idempotencyKey?: string;
  priority?: number;
  requestedByUserId?: string;
  requestedByActorType?: string;
  requestedByActorId?: string;
  conversationId?: string | null;
  initiatedByMessageId?: string | null;
  parentRequestId?: string | null;
  delegatedByRunId?: string | null;
  playbookKey?: string | null;
  planStepKey?: string | null;
  displayName?: string | null;
  statusReason?: string | null;
  dependencyKeys?: string[];
  sourceType: string;
  sourceId?: string;
  sourceWorkflowRunId?: string;
  sourceWorkflowNodeId?: string;
  sourceResourceType?: string;
  sourceResourceId?: string;
  reason?: string;
  triggerDetail?: string;
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
  dryRun?: boolean;
}

export interface AgentRunnerResult {
  ok: boolean;
  requestId?: string;
  runId?: string;
  agentInstanceId?: string;
  agentType?: string;
  status?: string;
  reason?: string;
}

export interface AgentRunnerCancelBySourceInput {
  organizationId: string;
  sourceType?: string;
  sourceResourceType: string;
  sourceResourceId: string;
  reason?: string;
  actorUserId?: string | null;
}

export interface AgentRunnerCancelBySourceResult {
  ok: boolean;
  cancelledRequests: number;
  cancelledRuns?: number;
  skippedRequests: number;
  skippedRuns?: number;
}

export interface AgentRunnerCancelRequestInput {
  organizationId: string;
  requestId: string;
  reason?: string;
  actorUserId?: string | null;
}

export interface AgentRunnerCancelRunInput {
  organizationId: string;
  runId: string;
  reason?: string;
  actorUserId?: string | null;
}

export interface AgentRunnerCancelByWorkflowRunInput {
  organizationId: string;
  workflowRunId: string;
  reason?: string;
  actorUserId?: string | null;
}

export interface AgentRunnerCancelResult {
  ok: boolean;
  cancelledRequests: number;
  cancelledRuns: number;
  skippedRequests: number;
  skippedRuns: number;
}

export interface AgentRunnerExecuteRequestInput {
  organizationId: string;
  requestId: string;
  workerId?: string;
}

export interface AgentRunnerExecuteRequestResult {
  executed: boolean;
  requestId?: string;
  runId?: string;
  reason?: string;
  errorCode?: string;
}

export interface AgentRunnerPort {
  runByType(type: string, input: AgentRunnerInput): Promise<AgentRunnerResult>;
  executeRequest?(
    input: AgentRunnerExecuteRequestInput,
  ): Promise<AgentRunnerExecuteRequestResult>;
  cancelRequest?(
    input: AgentRunnerCancelRequestInput,
  ): Promise<AgentRunnerCancelResult>;
  cancelRun?(input: AgentRunnerCancelRunInput): Promise<AgentRunnerCancelResult>;
  cancelByWorkflowRun?(
    input: AgentRunnerCancelByWorkflowRunInput,
  ): Promise<AgentRunnerCancelResult>;
  cancelBySource?(
    input: AgentRunnerCancelBySourceInput,
  ): Promise<AgentRunnerCancelBySourceResult>;
}
