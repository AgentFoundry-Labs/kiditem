import { Prisma } from "@prisma/client";
import {
  AgentDefinitionKeySchema,
  AgentSessionIdSchema,
  AgentVersionKeySchema,
  CopilotThreadIdSchema,
  formatAgentSessionName,
  formatAgentVersionName,
  OrganizationIdSchema,
} from "@kiditem/shared/identifiers";
import { AgentOsBoundaryError } from "../../../../../domain/agent-os.errors";
import type {
  AgentConversationEventPayload,
  AgentConversationEventRecord,
  AgentExecutionRecord,
  AgentPolicySnapshotRecord,
  AgentSessionRecord,
  AgentSessionSummaryRecord,
  AgentSessionTaskRecord,
  CurrentAgentExecution,
} from "../../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";

export const MAX_SESSION_LIST_LIMIT = 100;
export const MAX_REPLAY_LIMIT = 500;

export const sessionSelect = {
  id: true,
  organizationId: true,
  createdByUserId: true,
  copilotThreadId: true,
  primaryAgentVersionId: true,
  authorityProfileVersionId: true,
  contextEpoch: true,
  title: true,
  lastEventSequence: true,
  lifecycle: true,
  completedAt: true,
  cancelledAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
export const taskSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  parentTaskId: true,
  assignedAgentVersionId: true,
  objective: true,
  isRoot: true,
  status: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  finishedAt: true,
} as const;
export const policySelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  agentVersionId: true,
  authorityProfileVersionId: true,
  capabilityKeys: true,
  policyHash: true,
  createdAt: true,
} as const;
export const executionSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  sessionTaskId: true,
  copilotThreadId: true,
  aguiRunId: true,
  agentVersionId: true,
  runtimeType: true,
  modelIdentity: true,
  policySnapshotId: true,
  inputHash: true,
  currentInput: true,
  resourceRefs: true,
  attempt: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  errorCode: true,
} as const;
export const currentExecutionSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  copilotThreadId: true,
  aguiRunId: true,
  runtimeType: true,
  status: true,
  attempt: true,
  agentVersion: { select: { agentDefinitionKey: true } },
} as const;
export const eventSelect = {
  id: true,
  organizationId: true,
  sessionId: true,
  executionId: true,
  execution: { select: { aguiRunId: true } },
  externalEventId: true,
  sequence: true,
  eventType: true,
  schemaVersion: true,
  payload: true,
  createdAt: true,
} as const;

export type SessionRow = Prisma.AgentSessionGetPayload<{
  select: typeof sessionSelect;
}>;
export type TaskRow = Prisma.AgentSessionTaskGetPayload<{
  select: typeof taskSelect;
}>;
export type PolicyRow = Prisma.AgentPolicySnapshotGetPayload<{
  select: typeof policySelect;
}>;
export type ExecutionRow = Prisma.AgentExecutionGetPayload<{
  select: typeof executionSelect;
}>;
export type EventRow = Prisma.AgentConversationEventGetPayload<{
  select: typeof eventSelect;
}>;
type CurrentExecutionRow = Prisma.AgentExecutionGetPayload<{
  select: typeof currentExecutionSelect;
}>;

export function mapSession(row: SessionRow): AgentSessionRecord {
  return { ...row, lifecycle: sessionLifecycle(row.lifecycle) };
}
export function mapTask(row: TaskRow): AgentSessionTaskRecord {
  return row;
}
export function mapPolicy(row: PolicyRow): AgentPolicySnapshotRecord {
  return row;
}
export function mapExecution(row: ExecutionRow): AgentExecutionRecord {
  return row;
}
export function mapEvent(row: EventRow): AgentConversationEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sessionId: row.sessionId,
    executionId: row.executionId,
    aguiRunId: row.execution?.aguiRunId ?? null,
    externalEventId: row.externalEventId,
    sequence: row.sequence,
    eventType: conversationEventType(row.eventType),
    schemaVersion: row.schemaVersion,
    payload: row.payload as AgentConversationEventPayload,
    createdAt: row.createdAt,
  };
}
export function mapCurrentExecution(
  row: CurrentExecutionRow,
): CurrentAgentExecution {
  return {
    organizationId: row.organizationId,
    agentDefinitionKey: row.agentVersion.agentDefinitionKey,
    sessionId: row.sessionId,
    executionId: row.id,
    copilotThreadId: row.copilotThreadId,
    aguiRunId: row.aguiRunId,
    runtimeType: row.runtimeType,
    status: row.status,
    attempt: row.attempt,
  };
}
export function mapSessionSummary(row: {
  organizationId: string;
  id: string;
  copilotThreadId: string;
  lifecycle: string;
  updatedAt: Date;
  primaryAgentVersion: { agentDefinitionKey: string; version: number };
}): AgentSessionSummaryRecord {
  const definition = AgentDefinitionKeySchema.parse(
    row.primaryAgentVersion.agentDefinitionKey,
  );
  return {
    name: formatAgentSessionName(
      OrganizationIdSchema.parse(row.organizationId),
      AgentSessionIdSchema.parse(row.id),
    ),
    copilotThreadId: CopilotThreadIdSchema.parse(row.copilotThreadId),
    primaryAgentDefinitionKey: definition,
    primaryAgentVersion: formatAgentVersionName(
      definition,
      AgentVersionKeySchema.parse(String(row.primaryAgentVersion.version)),
    ),
    lifecycle: sessionLifecycle(row.lifecycle),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function boundedLimit(value: number, maximum: number): number {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(1, Math.trunc(value)))
    : maximum;
}
export function parseCapabilityKeys(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0) ||
    new Set(value).size !== value.length
  )
    throw boundary(
      "INTERACTION_POLICY_SNAPSHOT_INVALID",
      "The interaction policy snapshot has invalid capability keys.",
    );
  return [...value] as string[];
}
export function sessionLifecycle(
  value: string,
): AgentSessionSummaryRecord["lifecycle"] {
  if (
    value === "active" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "archived"
  )
    return value;
  throw boundary(
    "INTERACTION_SESSION_LIFECYCLE_INVALID",
    `Unsupported persisted session lifecycle: ${value}`,
  );
}
function conversationEventType(
  value: string,
): AgentConversationEventRecord["eventType"] {
  if (
    [
      "user_message",
      "assistant_message",
      "system_notice",
      "tool_activity",
      "state_snapshot",
      "hitl_request",
      "hitl_decision",
      "run_terminal",
    ].includes(value)
  )
    return value as AgentConversationEventRecord["eventType"];
  throw boundary(
    "INTERACTION_EVENT_TYPE_INVALID",
    `Unsupported persisted conversation event type: ${value}`,
  );
}
function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
