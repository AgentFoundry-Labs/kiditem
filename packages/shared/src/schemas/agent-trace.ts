import { z } from 'zod';
import { zIsoDate } from './common.js';
import { HeartbeatRunSchema } from './agent.js';
import { WorkflowRunSchema } from './workflow.js';

// ─── AgentTask ────────────────────────────────────────────────────────────────
// 출처: prisma/schema.prisma model AgentTask
// ⚠️ Date fields: scheduledAt, startedAt, completedAt, createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
//
// 불일치 기록 (vs Planner 명세):
//  - Planner 가 언급한 `agentId` 필드는 실제 스키마에 없음. agent 는 `agentType` 으로만 식별됨.
//  - Planner 가 언급한 `duration` 필드는 실제 스키마에 없음. startedAt/completedAt 으로 계산.
//  - 실제 스키마의 `priority`, `sourceDataId`, `updatedAt` 은 Planner 명세에 없지만 포함.
export const AgentTaskSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  agentType: z.string(),
  status: z.string(),
  priority: z.number().int(),
  workflowRunId: z.string().nullable(),
  workflowNodeId: z.string().nullable(),
  sourceDataId: z.string().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  scheduledAt: zIsoDate.nullable(),
  startedAt: zIsoDate.nullable(),
  completedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// ─── WorkflowRun (trace 응답용) ───────────────────────────────────────────────
// Trace 응답에서는 전체 WorkflowRun + steps 포함 (Planner 권고).
// 기존 WorkflowRunSchema 에 steps(optional) 가 이미 포함되어 있으므로 alias 로 사용.
export const WorkflowRunTraceSchema = WorkflowRunSchema;

// ─── AgentWakeupRequest ───────────────────────────────────────────────────────
// 출처: prisma/schema.prisma model AgentWakeupRequest
// ⚠️ Date fields: requestedAt, claimedAt, finishedAt, createdAt, updatedAt
export const AgentWakeupRequestSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  source: z.string(),
  triggerDetail: z.string().nullable(),
  reason: z.string().nullable(),
  payload: z.unknown().nullable(),
  status: z.string(),
  coalescedCount: z.number().int(),
  requestedByType: z.string().nullable(),
  requestedById: z.string().nullable(),
  runId: z.string().nullable(),
  requestedAt: zIsoDate,
  claimedAt: zIsoDate.nullable(),
  finishedAt: zIsoDate.nullable(),
  error: z.string().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// ─── AgentEvent ───────────────────────────────────────────────────────────────
// 출처: prisma/schema.prisma model AgentEvent
// ⚠️ Date fields: restoredAt, createdAt
// 불일치 기록: Planner 명세의 `snapshot` 필드는 실제 스키마에 없음.
//              실제 스키마는 tableName/recordId/fieldName/valueBefore/valueAfter/restoredAt 을 사용.
export const AgentEventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string(),
  runId: z.string().nullable(),
  eventType: z.string(),
  category: z.string().nullable(),
  detail: z.string().nullable(),
  action: z.string().nullable(),
  tableName: z.string().nullable(),
  recordId: z.string().nullable(),
  fieldName: z.string().nullable(),
  valueBefore: z.unknown().nullable(),
  valueAfter: z.unknown().nullable(),
  restoredAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
});

// ─── AgentLog ─────────────────────────────────────────────────────────────────
// 출처: prisma/schema.prisma model AgentLog
// ADR-0001: level 은 Prisma enum 이 아닌 String → 값 제약 없이 z.string()
export const AgentLogSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  level: z.string(),
  message: z.string(),
  data: z.unknown().nullable(),
  createdAt: zIsoDate,
});

// ─── Trace 응답 구성요소 ──────────────────────────────────────────────────────
export const TraceabilitySchema = z.object({
  markerFound: z.boolean(),
  creationPath: z.enum(['workflow', 'direct', 'unknown']),
  warning: z.string().nullable(),
});

export const TracePaginationSchema = z.object({
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

// ─── AgentTrace (GET /api/agent-registry/tasks/:id/trace) ─────────────────────
export const AgentTraceSchema = z.object({
  task: AgentTaskSchema,
  workflowRun: WorkflowRunTraceSchema.nullable(),
  heartbeatRuns: z.array(HeartbeatRunSchema),
  wakeupRequests: z.array(AgentWakeupRequestSchema),
  events: z.array(AgentEventSchema),
  logs: z.array(AgentLogSchema),
  traceability: TraceabilitySchema,
  pagination: TracePaginationSchema,
});

// ─── AgentTask 목록 응답 (GET /api/agent-registry/tasks) ──────────────────────
export const AgentTaskListResponseSchema = z.object({
  items: z.array(AgentTaskSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type WorkflowRunTrace = z.infer<typeof WorkflowRunTraceSchema>;
export type AgentWakeupRequest = z.infer<typeof AgentWakeupRequestSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentLog = z.infer<typeof AgentLogSchema>;
export type Traceability = z.infer<typeof TraceabilitySchema>;
export type TracePagination = z.infer<typeof TracePaginationSchema>;
export type AgentTrace = z.infer<typeof AgentTraceSchema>;
export type AgentTaskListResponse = z.infer<typeof AgentTaskListResponseSchema>;
