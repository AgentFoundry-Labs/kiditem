export const AGENT_RUNNER_PORT = Symbol('AGENT_RUNNER_PORT');

export interface AgentRunnerInput {
  organizationId: string;
  taskKey?: string;
  idempotencyKey?: string;
  priority?: number;
  requestedByUserId?: string;
  requestedByActorType?: string;
  requestedByActorId?: string;
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
}

export interface AgentRunnerCancelBySourceResult {
  ok: boolean;
  cancelledRequests: number;
  skippedRequests: number;
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
  cancelBySource?(
    input: AgentRunnerCancelBySourceInput,
  ): Promise<AgentRunnerCancelBySourceResult>;
}
