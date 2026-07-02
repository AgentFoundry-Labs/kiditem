import { Prisma } from '@prisma/client';
import {
  type AgentArtifactRecord,
  type AgentArtifactStatus,
  type AgentAuthorizationDecision,
  type AgentConversationRecord,
  type AgentConversationStatus,
  type AgentInstanceLifecycleStatus,
  type AgentInstanceRecord,
  type AgentMessageRecord,
  type AgentMessageRole,
  type AgentRunEventRecord,
  type AgentRunRecord,
  type AgentRunRequestRecord,
  type AgentRunRequestStatus,
  type AgentRunStatus,
  type AgentTaskSessionRecord,
  type AgentToolInvocationRecord,
  type AgentToolInvocationStatus,
} from '../../../domain/agent-os.types';

export interface RunRequestRow {
  id: string;
  organization_id: string;
  agent_instance_id: string;
  task_session_id: string;
  conversation_id: string | null;
  initiated_by_message_id: string | null;
  parent_request_id: string | null;
  delegated_by_run_id: string | null;
  playbook_key: string | null;
  plan_step_key: string | null;
  display_name: string | null;
  status_reason: string | null;
  dependency_keys: Prisma.JsonValue;
  source: string;
  trigger_detail: string | null;
  reason: string | null;
  idempotency_key: string | null;
  priority: number;
  source_workflow_run_id: string | null;
  source_workflow_node_id: string | null;
  source_resource_type: string | null;
  source_resource_id: string | null;
  requested_by_user_id: string | null;
  requested_by_actor_type: string | null;
  requested_by_actor_id: string | null;
  payload: Prisma.JsonValue;
  status: string;
  scheduled_for: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  attempts: number;
  max_attempts: number;
  finished_at: Date | null;
  coalesced_into_request_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export type RunRequestContext = {
  taskKey: string;
  adapterType: string;
  agentType: string;
  // Optional: newly-created requests have no run yet, and fresh claims happen
  // before the run insert. Set to null in those cases.
  latestRunId?: string | null;
};

export function clampLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || limit <= 0) return defaultLimit;
  return Math.min(limit, defaultLimit);
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function toInstanceRecord(
  row: Prisma.AgentInstanceGetPayload<{}>,
): AgentInstanceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    name: row.name,
    role: row.role,
    title: row.title,
    icon: row.icon,
    reportsToId: row.reportsToId,
    lifecycleStatus: row.lifecycleStatus as AgentInstanceLifecycleStatus,
    pauseReason: row.pauseReason,
    trustLevel: row.trustLevel,
    adapterType: row.adapterType,
    modelOverride: row.modelOverride,
    adapterConfig: (row.adapterConfig ?? {}) as Record<string, unknown>,
    runtimeConfig: (row.runtimeConfig ?? {}) as Record<string, unknown>,
    promptPathOverride: row.promptPathOverride,
  };
}

export function toTaskSessionRecord(
  row: Prisma.AgentTaskSessionGetPayload<{}>,
): AgentTaskSessionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    adapterType: row.adapterType,
    taskKey: row.taskKey,
    title: row.title,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    sessionDisplay: row.sessionDisplay,
    lastRunId: row.lastRunId,
    lastError: row.lastError,
  };
}

export function toRunRequestRecord(
  row: Prisma.AgentRunRequestGetPayload<{}>,
  context: RunRequestContext,
): AgentRunRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    taskSessionId: row.taskSessionId,
    source: row.source,
    triggerDetail: row.triggerDetail,
    reason: row.reason,
    idempotencyKey: row.idempotencyKey,
    priority: row.priority,
    sourceWorkflowRunId: row.sourceWorkflowRunId,
    sourceWorkflowNodeId: row.sourceWorkflowNodeId,
    sourceResourceType: row.sourceResourceType,
    sourceResourceId: row.sourceResourceId,
    requestedByUserId: row.requestedByUserId,
    requestedByActorType: row.requestedByActorType,
    requestedByActorId: row.requestedByActorId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as AgentRunRequestStatus,
    scheduledFor: row.scheduledFor,
    claimedAt: row.claimedAt,
    claimedBy: row.claimedBy,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    finishedAt: row.finishedAt,
    coalescedIntoRequestId: row.coalescedIntoRequestId,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    taskKey: context.taskKey,
    agentType: context.agentType,
    adapterType: context.adapterType,
    latestRunId: context.latestRunId ?? null,
    conversationId: row.conversationId,
    initiatedByMessageId: row.initiatedByMessageId,
    parentRequestId: row.parentRequestId,
    delegatedByRunId: row.delegatedByRunId,
    playbookKey: row.playbookKey,
    planStepKey: row.planStepKey,
    displayName: row.displayName,
    statusReason: row.statusReason,
    dependencyKeys: toStringArray(row.dependencyKeys),
  };
}

export function rawRowToRunRequestRecord(
  row: RunRequestRow,
  context: RunRequestContext,
): AgentRunRequestRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentInstanceId: row.agent_instance_id,
    taskSessionId: row.task_session_id,
    source: row.source,
    triggerDetail: row.trigger_detail,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    priority: row.priority,
    sourceWorkflowRunId: row.source_workflow_run_id,
    sourceWorkflowNodeId: row.source_workflow_node_id,
    sourceResourceType: row.source_resource_type,
    sourceResourceId: row.source_resource_id,
    requestedByUserId: row.requested_by_user_id,
    requestedByActorType: row.requested_by_actor_type,
    requestedByActorId: row.requested_by_actor_id,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as AgentRunRequestStatus,
    scheduledFor: row.scheduled_for,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    finishedAt: row.finished_at,
    coalescedIntoRequestId: row.coalesced_into_request_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskKey: context.taskKey,
    agentType: context.agentType,
    adapterType: context.adapterType,
    latestRunId: context.latestRunId ?? null,
    conversationId: row.conversation_id,
    initiatedByMessageId: row.initiated_by_message_id,
    parentRequestId: row.parent_request_id,
    delegatedByRunId: row.delegated_by_run_id,
    playbookKey: row.playbook_key,
    planStepKey: row.plan_step_key,
    displayName: row.display_name,
    statusReason: row.status_reason,
    dependencyKeys: toStringArray(row.dependency_keys),
  };
}

export function toRunRecord(row: Prisma.AgentRunGetPayload<{}>): AgentRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    taskSessionId: row.taskSessionId,
    retryOfRunId: row.retryOfRunId,
    status: row.status as AgentRunStatus,
    attempt: row.attempt,
    invocationSource: row.invocationSource,
    adapterType: row.adapterType,
    model: row.model,
    provider: row.provider,
    taskKey: row.taskKey,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    output: (row.output as Record<string, unknown> | null) ?? null,
    lastEventSeq: row.lastEventSeq,
  };
}

export function toRunEventRecord(
  row: Prisma.AgentRunEventGetPayload<{}>,
): AgentRunEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    runId: row.runId,
    agentInstanceId: row.agentInstanceId,
    seq: row.seq,
    type: row.type,
    level: row.level,
    stream: row.stream,
    message: row.message,
    data: (row.data ?? {}) as Record<string, unknown>,
    logRef: row.logRef,
    createdAt: row.createdAt,
  };
}

export function toConversationRecord(
  row: Prisma.AgentConversationGetPayload<{}>,
): AgentConversationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    status: row.status as AgentConversationStatus,
    createdByUserId: row.createdByUserId,
    rootRequestId: row.rootRequestId,
    lastMessageAt: row.lastMessageAt,
    metadata: toRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMessageRecord(
  row: Prisma.AgentMessageGetPayload<{}>,
): AgentMessageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    role: row.role as AgentMessageRole,
    content: row.content,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    runId: row.runId,
    metadata: toRecord(row.metadata),
    createdAt: row.createdAt,
  };
}

export function toToolInvocationRecord(
  row: Prisma.AgentToolInvocationGetPayload<{}>,
): AgentToolInvocationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    runId: row.runId,
    approvalRequestId: row.approvalRequestId,
    capabilityKey: row.capabilityKey,
    status: row.status as AgentToolInvocationStatus,
    policyDecision: row.policyDecision as AgentAuthorizationDecision,
    reasonCode: row.reasonCode,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    idempotencyKey: row.idempotencyKey,
    inputSummary: toRecord(row.inputSummary),
    outputSummary: row.outputSummary ? toRecord(row.outputSummary) : null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toArtifactRecord(
  row: Prisma.AgentArtifactGetPayload<{}>,
): AgentArtifactRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    agentInstanceId: row.agentInstanceId,
    requestId: row.requestId,
    runId: row.runId,
    toolInvocationId: row.toolInvocationId,
    artifactType: row.artifactType,
    targetDomain: row.targetDomain,
    targetModel: row.targetModel,
    targetId: row.targetId,
    title: row.title,
    href: row.href,
    summary: toRecord(row.summary),
    status: row.status as AgentArtifactStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
