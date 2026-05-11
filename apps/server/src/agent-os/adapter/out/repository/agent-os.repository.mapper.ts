import { Prisma } from '@prisma/client';
import {
  type AgentInstanceLifecycleStatus,
  type AgentInstanceRecord,
  type AgentRunEventRecord,
  type AgentRunRecord,
  type AgentRunRequestRecord,
  type AgentRunRequestStatus,
  type AgentRunStatus,
  type AgentTaskSessionRecord,
} from '../../../domain/agent-os.types';

export interface RunRequestRow {
  id: string;
  organization_id: string;
  agent_instance_id: string;
  task_session_id: string;
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
