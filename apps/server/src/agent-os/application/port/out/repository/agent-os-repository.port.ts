import type {
  AgentArtifactRecord,
  AgentInstanceRecord,
  AgentConversationRecord,
  AgentMessageRecord,
  AgentRunRecord,
  AgentRunRequestRecord,
  AgentRunRequestStatus,
  AgentRunStatus,
  AgentTaskSessionRecord,
  AgentRunEventRecord,
  AgentAuthorizationDecision,
  AgentApprovalStatus,
  AgentInstanceLifecycleStatus,
  AgentToolInvocationRecord,
} from '../../../../domain/agent-os.types';

export const AGENT_OS_REPOSITORY_PORT = Symbol('AGENT_OS_REPOSITORY_PORT');

export interface InstanceToolPolicyRecord {
  toolId: string;
  toolKey: string;
  effect: 'allow' | 'deny' | 'approval_required';
  approvalMode: 'none' | 'admin' | 'self';
  dryRunMode: 'optional' | 'required' | 'disabled';
  constraints: Record<string, unknown>;
  organizationId: string;
  agentInstanceId: string;
}

export interface CreateAgentInstanceInput {
  organizationId: string;
  type: string;
  name: string;
  role?: string;
  title?: string | null;
  icon?: string | null;
  reportsToId?: string | null;
  lifecycleStatus?: AgentInstanceLifecycleStatus;
  trustLevel?: number;
  adapterType: string;
  modelOverride?: string | null;
  adapterConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
  promptPathOverride?: string | null;
}

export interface UpdateAgentInstanceInput {
  organizationId: string;
  id: string;
  name?: string;
  role?: string;
  title?: string | null;
  icon?: string | null;
  reportsToId?: string | null;
  lifecycleStatus?: AgentInstanceLifecycleStatus;
  pauseReason?: string | null;
  trustLevel?: number;
  modelOverride?: string | null;
  adapterConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
  promptPathOverride?: string | null;
}

export interface UpsertInstanceToolPolicyInput {
  organizationId: string;
  agentInstanceId: string;
  toolKey: string;
  effect: 'allow' | 'deny' | 'approval_required';
  approvalMode?: 'none' | 'admin' | 'self';
  dryRunMode?: 'optional' | 'required' | 'disabled';
  constraints?: Record<string, unknown>;
}

export interface CreateRunRequestRecordInput {
  organizationId: string;
  agentInstanceId: string;
  taskSessionId: string;
  conversationId?: string | null;
  initiatedByMessageId?: string | null;
  parentRequestId?: string | null;
  delegatedByRunId?: string | null;
  playbookKey?: string | null;
  planStepKey?: string | null;
  displayName?: string | null;
  statusReason?: string | null;
  dependencyKeys?: string[];
  source: string;
  triggerDetail?: string | null;
  reason?: string | null;
  idempotencyKey?: string | null;
  priority?: number;
  sourceWorkflowRunId?: string | null;
  sourceWorkflowNodeId?: string | null;
  sourceResourceType?: string | null;
  sourceResourceId?: string | null;
  requestedByUserId?: string | null;
  requestedByActorType?: string | null;
  requestedByActorId?: string | null;
  payload: Record<string, unknown>;
  scheduledFor: Date;
  maxAttempts?: number;
}

export interface CreateRunRecordInput {
  organizationId: string;
  agentInstanceId: string;
  requestId: string;
  taskSessionId: string;
  attempt: number;
  invocationSource: string;
  adapterType: string;
  model: string;
  taskKey?: string | null;
  input: Record<string, unknown>;
}

export interface AppendRunEventInput {
  organizationId: string;
  runId: string;
  agentInstanceId: string;
  type: string;
  level?: string;
  stream?: string | null;
  message?: string | null;
  data?: Record<string, unknown>;
  logRef?: string | null;
}

export interface FinalizeRunInput {
  organizationId: string;
  runId: string;
  requestId: string;
  status: AgentRunStatus;
  output?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  provider?: string | null;
  cost?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    costMicros: bigint;
  };
}

export interface FinalizeRunResult {
  run: AgentRunRecord;
  requestStatus: AgentRunRequestRecord['status'];
}

export interface RecordCostEventInput {
  organizationId: string;
  agentInstanceId: string;
  requestId: string;
  runId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costMicros: bigint;
  metadata?: Record<string, unknown>;
}

export interface FailClaimedRequestInput {
  organizationId: string;
  requestId: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
}

export interface MarkRequestStatusInput {
  organizationId: string;
  requestId: string;
  status: AgentRunRequestStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  coalescedIntoRequestId?: string | null;
  payload?: Record<string, unknown>;
}

export interface MarkRequestStatusIfCurrentInput extends MarkRequestStatusInput {
  currentStatuses: AgentRunRequestStatus[];
}

export interface CreateAuthorizationEventInput {
  organizationId: string;
  agentInstanceId: string;
  requestId?: string | null;
  runId?: string | null;
  toolKey?: string | null;
  toolId?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  action: string;
  decision: AgentAuthorizationDecision;
  reasonCode?: string | null;
  reason?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  policySnapshot?: Record<string, unknown>;
  requestedByUserId?: string | null;
  decidedByUserId?: string | null;
}

export interface CreateApprovalRequestInput {
  organizationId: string;
  agentInstanceId: string;
  requestId: string;
  runId?: string | null;
  prompt?: string | null;
  reasonCode?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
  actionSnapshot?: Record<string, unknown> | null;
  requestedByActorType?: string | null;
  requestedByActorId?: string | null;
  requestedByUserId?: string | null;
  approverUserId?: string | null;
  expiresAt?: Date | null;
}

export interface ResolveApprovalRequestInput {
  organizationId: string;
  approvalRequestId: string;
  status: AgentApprovalStatus;
  decidedByUserId?: string | null;
  decisionReason?: string | null;
}

export interface AgentApprovalRequestRecord {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  requestId: string;
  runId: string | null;
  status: AgentApprovalStatus;
  reasonCode: string | null;
  reason: string | null;
  prompt: string | null;
  payload: Record<string, unknown>;
  actionSnapshot: Record<string, unknown> | null;
  requestedByActorType: string | null;
  requestedByActorId: string | null;
  requestedByUserId: string | null;
  approverUserId: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationInput {
  organizationId: string;
  title: string;
  createdByUserId: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  organizationId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agentInstanceId?: string | null;
  requestId?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateToolInvocationInput {
  organizationId: string;
  conversationId?: string | null;
  agentInstanceId: string;
  requestId?: string | null;
  runId?: string | null;
  approvalRequestId?: string | null;
  capabilityKey: string;
  policyDecision: AgentAuthorizationDecision;
  reasonCode?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  idempotencyKey?: string | null;
  inputSummary?: Record<string, unknown>;
}

export type CreateToolInvocationResult = AgentToolInvocationRecord & {
  created?: boolean;
};

export interface CompleteToolInvocationInput {
  organizationId: string;
  invocationId: string;
  approvalRequestId?: string | null;
  status: 'succeeded' | 'failed' | 'cancelled' | 'waiting_approval';
  outputSummary?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

export interface MarkToolInvocationRunningInput {
  organizationId: string;
  invocationId: string;
}

export interface MarkToolInvocationRunningResult {
  claimed: boolean;
  invocation: AgentToolInvocationRecord;
}

export interface CreateArtifactInput {
  organizationId: string;
  conversationId?: string | null;
  agentInstanceId?: string | null;
  requestId?: string | null;
  runId?: string | null;
  toolInvocationId?: string | null;
  artifactType: string;
  targetDomain: string;
  targetModel: string;
  targetId?: string | null;
  title: string;
  href?: string | null;
  summary?: Record<string, unknown>;
}

export interface CompleteToolInvocationWithArtifactsInput
  extends CompleteToolInvocationInput {
  artifacts: Array<Omit<CreateArtifactInput, 'organizationId' | 'toolInvocationId'>>;
}

export interface CompleteToolInvocationWithArtifactsResult {
  invocation: AgentToolInvocationRecord;
  artifacts: AgentArtifactRecord[];
}

export interface FindRequestsQuery {
  organizationId: string;
  agentInstanceId?: string | null;
  status?: AgentRunRequestStatus[] | null;
  conversationId?: string | null;
  source?: string | null;
  sourceWorkflowRunId?: string | null;
  sourceResourceType?: string | null;
  sourceResourceId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface FindRunsQuery {
  organizationId: string;
  agentInstanceId?: string | null;
  status?: AgentRunStatus[] | null;
  cursor?: string | null;
  limit?: number;
}

export interface FindRunEventsQuery {
  organizationId: string;
  runId: string;
  cursorSeq?: number | null;
  limit?: number;
}

export interface FindCostEventsQuery {
  organizationId: string;
  agentInstanceId?: string | null;
  provider?: string | null;
  model?: string | null;
  fromOccurredAt?: Date | null;
  toOccurredAt?: Date | null;
  cursor?: string | null;
  limit?: number;
}

export interface FindAuthorizationEventsQuery {
  organizationId: string;
  agentInstanceId?: string | null;
  decision?: AgentAuthorizationDecision[] | null;
  cursor?: string | null;
  limit?: number;
}

export interface FindApprovalRequestsQuery {
  organizationId: string;
  agentInstanceId?: string | null;
  status?: AgentApprovalStatus[] | null;
  cursor?: string | null;
  limit?: number;
}

export interface AgentOsRepositoryPort {
  // Instances
  findActiveInstanceByType(input: {
    organizationId: string;
    type: string;
  }): Promise<AgentInstanceRecord | null>;
  findInstanceById(input: {
    organizationId: string;
    id: string;
  }): Promise<AgentInstanceRecord | null>;
  listInstances(input: { organizationId: string }): Promise<AgentInstanceRecord[]>;
  createInstanceWithRuntimeState(
    input: CreateAgentInstanceInput,
  ): Promise<AgentInstanceRecord>;
  updateInstance(input: UpdateAgentInstanceInput): Promise<AgentInstanceRecord>;

  // Tool policy
  resolveInstanceToolPolicy(input: {
    organizationId: string;
    agentInstanceId: string;
    toolKey: string;
  }): Promise<InstanceToolPolicyRecord | null>;
  listInstanceToolPolicies(input: {
    organizationId: string;
    agentInstanceId: string;
  }): Promise<InstanceToolPolicyRecord[]>;
  upsertInstanceToolPolicy(
    input: UpsertInstanceToolPolicyInput,
  ): Promise<InstanceToolPolicyRecord>;

  // Sessions
  ensureTaskSession(input: {
    organizationId: string;
    agentInstanceId: string;
    adapterType: string;
    taskKey: string;
    title?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AgentTaskSessionRecord>;
  getTaskSession(input: {
    organizationId: string;
    taskSessionId: string;
  }): Promise<AgentTaskSessionRecord | null>;
  updateTaskSessionMetadata(input: {
    organizationId: string;
    taskSessionId: string;
    metadata: Record<string, unknown>;
  }): Promise<AgentTaskSessionRecord>;

  // Requests
  createRunRequest(
    input: CreateRunRequestRecordInput,
  ): Promise<AgentRunRequestRecord>;
  findRunRequestByIdempotency(input: {
    organizationId: string;
    agentInstanceId: string;
    idempotencyKey: string;
  }): Promise<AgentRunRequestRecord | null>;
  findRunRequestById(input: {
    organizationId: string;
    requestId: string;
  }): Promise<AgentRunRequestRecord | null>;
  listRunRequests(input: FindRequestsQuery): Promise<AgentRunRequestRecord[]>;
  claimNextRunRequest(input: {
    workerId: string;
    now: Date;
    organizationId?: string | null;
  }): Promise<AgentRunRequestRecord | null>;
  claimRunRequestById(input: {
    workerId: string;
    now: Date;
    organizationId: string;
    requestId: string;
  }): Promise<AgentRunRequestRecord | null>;
  failClaimedRequest(input: FailClaimedRequestInput): Promise<void>;
  markRequestStatus(input: MarkRequestStatusInput): Promise<AgentRunRequestRecord>;
  markRequestStatusIfCurrent(
    input: MarkRequestStatusIfCurrentInput,
  ): Promise<AgentRunRequestRecord | null>;

  // Runs + events
  createRunForRequest(input: CreateRunRecordInput): Promise<AgentRunRecord>;
  findRunById(input: {
    organizationId: string;
    runId: string;
  }): Promise<AgentRunRecord | null>;
  /**
   * Latest `AgentRun` for a given `(organizationId, requestId)` tuple,
   * scoped by status if provided. Used by reconcile/replay paths that
   * need the run output for a *specific* request, not the latest run on
   * the agent instance — `listRuns({ agentInstanceId, ... })` cannot
   * answer "what was THIS request's output?" because newer runs from
   * the same instance shadow it.
   */
  findRunByRequestId(input: {
    organizationId: string;
    requestId: string;
    status?: AgentRunStatus[] | null;
  }): Promise<AgentRunRecord | null>;
  listRuns(input: FindRunsQuery): Promise<AgentRunRecord[]>;
  appendRunEvent(input: AppendRunEventInput): Promise<AgentRunEventRecord>;
  listRunEvents(input: FindRunEventsQuery): Promise<AgentRunEventRecord[]>;
  finalizeRun(input: FinalizeRunInput): Promise<FinalizeRunResult>;

  // Cost / audit
  recordCostEvent(input: RecordCostEventInput): Promise<void>;
  listCostEvents(input: FindCostEventsQuery): Promise<{
    items: Array<{
      id: string;
      organizationId: string;
      agentInstanceId: string;
      requestId: string;
      runId: string;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      costMicros: bigint;
      occurredAt: Date;
    }>;
    totalCostMicros: bigint;
  }>;

  createAuthorizationEvent(input: CreateAuthorizationEventInput): Promise<void>;
  listAuthorizationEvents(input: FindAuthorizationEventsQuery): Promise<
    Array<{
      id: string;
      organizationId: string;
      agentInstanceId: string;
      requestId: string | null;
      runId: string | null;
      toolKey: string | null;
      action: string;
      decision: AgentAuthorizationDecision;
      reasonCode: string | null;
      reason: string | null;
      resourceType: string | null;
      resourceId: string | null;
      createdAt: Date;
    }>
  >;

  // Approvals
  createApprovalRequest(input: CreateApprovalRequestInput): Promise<{
    id: string;
    status: AgentApprovalStatus;
  }>;
  findApprovalRequestById(input: {
    organizationId: string;
    approvalRequestId: string;
  }): Promise<AgentApprovalRequestRecord | null>;
  listApprovalRequests(
    input: FindApprovalRequestsQuery,
  ): Promise<AgentApprovalRequestRecord[]>;
  resolveApprovalRequest(input: ResolveApprovalRequestInput): Promise<void>;

  // Conversations / visible graph
  createConversation(input: CreateConversationInput): Promise<AgentConversationRecord>;
  findConversationById(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AgentConversationRecord | null>;
  listConversations(input: {
    organizationId: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<AgentConversationRecord[]>;
  updateConversationRootRequest(input: {
    organizationId: string;
    conversationId: string;
    rootRequestId: string;
  }): Promise<void>;
  createMessage(input: CreateMessageInput): Promise<AgentMessageRecord>;
  listMessages(input: {
    organizationId: string;
    conversationId: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<AgentMessageRecord[]>;
  createToolInvocation(
    input: CreateToolInvocationInput,
  ): Promise<CreateToolInvocationResult>;
  findToolInvocationByIdempotency(input: {
    organizationId: string;
    capabilityKey: string;
    idempotencyKey: string;
  }): Promise<AgentToolInvocationRecord | null>;
  markToolInvocationRunning(
    input: MarkToolInvocationRunningInput,
  ): Promise<MarkToolInvocationRunningResult>;
  completeToolInvocation(
    input: CompleteToolInvocationInput,
  ): Promise<AgentToolInvocationRecord>;
  completeToolInvocationWithArtifacts?(
    input: CompleteToolInvocationWithArtifactsInput,
  ): Promise<CompleteToolInvocationWithArtifactsResult>;
  listToolInvocations(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
  }): Promise<AgentToolInvocationRecord[]>;
  createArtifact(input: CreateArtifactInput): Promise<AgentArtifactRecord>;
  listArtifacts(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
    toolInvocationId?: string | null;
    artifactType?: string | null;
  }): Promise<AgentArtifactRecord[]>;
}
