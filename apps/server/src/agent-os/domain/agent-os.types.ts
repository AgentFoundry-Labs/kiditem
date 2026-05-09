// Pure domain types and constants for Agent OS. No Prisma, no Nest, no IO.

export const AGENT_INSTANCE_LIFECYCLE_STATUSES = [
  'active',
  'paused',
  'disabled',
] as const;
export type AgentInstanceLifecycleStatus =
  (typeof AGENT_INSTANCE_LIFECYCLE_STATUSES)[number];

export const AGENT_RUN_REQUEST_STATUSES = [
  'pending',
  'claimed',
  'coalesced',
  'skipped',
  'requires_approval',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type AgentRunRequestStatus =
  (typeof AGENT_RUN_REQUEST_STATUSES)[number];

export const AGENT_RUN_STATUSES = [
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_TOOL_POLICY_EFFECTS = [
  'allow',
  'deny',
  'approval_required',
] as const;
export type AgentToolPolicyEffect =
  (typeof AGENT_TOOL_POLICY_EFFECTS)[number];

export const AGENT_AUTHORIZATION_DECISIONS = [
  'allowed',
  'denied',
  'approval_required',
] as const;
export type AgentAuthorizationDecision =
  (typeof AGENT_AUTHORIZATION_DECISIONS)[number];

export const AGENT_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
] as const;
export type AgentApprovalStatus =
  (typeof AGENT_APPROVAL_STATUSES)[number];

export const AGENT_DEFINITION_RUNTIME_KINDS = [
  'agent',
  'coordinator',
  'tool_wrapper',
] as const;
export type AgentDefinitionRuntimeKind =
  (typeof AGENT_DEFINITION_RUNTIME_KINDS)[number];

export interface AgentDefinitionToolPolicyRecord {
  toolKey: string;
  effect: AgentToolPolicyEffect;
  approvalMode: 'none' | 'admin' | 'self';
  dryRunMode: 'optional' | 'required' | 'disabled';
  constraints: Record<string, unknown>;
}

export interface AgentDefinitionRecord {
  id: string;
  type: string;
  name: string;
  description: string | null;
  promptPath: string;
  defaultAdapterType: string;
  defaultModelEnv: string;
  defaultRuntimeConfig: Record<string, unknown>;
  defaultCapabilities: Record<string, unknown>;
  catalogStatus: string;
  marketplaceId: string | null;
  runtimeKind: AgentDefinitionRuntimeKind;
  defaultToolPolicies: AgentDefinitionToolPolicyRecord[];
}

export interface AgentInstanceRecord {
  id: string;
  organizationId: string;
  type: string;
  name: string;
  role: string;
  title: string | null;
  icon: string | null;
  reportsToId: string | null;
  lifecycleStatus: AgentInstanceLifecycleStatus;
  pauseReason: string | null;
  trustLevel: number;
  adapterType: string;
  modelOverride: string | null;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  promptPathOverride: string | null;
}

export interface AgentTaskSessionRecord {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  adapterType: string;
  taskKey: string;
  title: string | null;
  metadata: Record<string, unknown>;
  sessionDisplay: string | null;
  lastRunId: string | null;
  lastError: string | null;
}

export interface AgentRunRequestRecord {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  taskSessionId: string;
  source: string;
  triggerDetail: string | null;
  reason: string | null;
  idempotencyKey: string | null;
  priority: number;
  sourceWorkflowRunId: string | null;
  sourceWorkflowNodeId: string | null;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  requestedByUserId: string | null;
  requestedByActorType: string | null;
  requestedByActorId: string | null;
  payload: Record<string, unknown>;
  status: AgentRunRequestStatus;
  scheduledFor: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  attempts: number;
  maxAttempts: number;
  finishedAt: Date | null;
  coalescedIntoRequestId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskKey: string;
  agentType: string;
  adapterType: string;
  latestRunId: string | null;
}

export interface AgentRunRecord {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  requestId: string;
  taskSessionId: string;
  retryOfRunId: string | null;
  status: AgentRunStatus;
  attempt: number;
  invocationSource: string;
  adapterType: string;
  model: string;
  provider: string | null;
  taskKey: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  output: Record<string, unknown> | null;
  lastEventSeq: number;
}

export interface AgentRunEventRecord {
  id: string;
  organizationId: string;
  runId: string;
  agentInstanceId: string;
  seq: number;
  type: string;
  level: string;
  stream: string | null;
  message: string | null;
  data: Record<string, unknown>;
  logRef: string | null;
  createdAt: Date;
}

export interface AgentCostEventRecord {
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
}

export interface AgentAuthorizationEventRecord {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  requestId: string | null;
  runId: string | null;
  toolId: string | null;
  toolKey: string | null;
  actorType: string | null;
  actorId: string | null;
  action: string;
  decision: AgentAuthorizationDecision;
  reasonCode: string | null;
  reason: string | null;
  resourceType: string | null;
  resourceId: string | null;
  policySnapshot: Record<string, unknown>;
  createdAt: Date;
}

export function resolveEffectiveModel(input: {
  definitionDefault: string | null;
  instanceOverride: string | null;
  requestOverride?: string | null;
}): string | null {
  // No silent fallback. Return null when nothing was explicitly configured.
  if (input.requestOverride && input.requestOverride.length > 0) {
    return input.requestOverride;
  }
  if (input.instanceOverride && input.instanceOverride.length > 0) {
    return input.instanceOverride;
  }
  if (input.definitionDefault && input.definitionDefault.length > 0) {
    return input.definitionDefault;
  }
  return null;
}
