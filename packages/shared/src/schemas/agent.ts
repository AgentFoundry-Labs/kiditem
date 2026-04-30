import { z } from 'zod';
import { zIsoDate } from './common.js';

const HEARTBEAT_FAILURE_TYPES = ['timeout'] as const;

// AgentRuntimeState — 에이전트 누적 상태
// 출처: agent-registry.service.ts — Prisma AgentRuntimeState 직접 반환
// ⚠️ Date fields: createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const AgentRuntimeStateSchema = z.object({
  agentId: z.string(),
  companyId: z.string(),
  adapterType: z.string(),
  sessionId: z.string().nullable(),
  stateJson: z.record(z.unknown()),
  lastRunId: z.string().nullable(),
  lastRunStatus: z.string().nullable(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostCents: z.number(),
  lastError: z.string().nullable(),
  consecutiveFailCount: z.number(),
  lastFailedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// GET /api/agent-registry 응답의 각 item
// 출처: agent-registry.service.ts findAll() — Prisma AgentDefinition 직접 반환
// ⚠️ Date fields: pausedAt, budgetResetAt, lastHeartbeatAt, createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const AgentSchema = z.object({
  id: z.string(),
  companyId: z.string().nullable(),
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  adapterType: z.string(),
  adapterConfig: z.record(z.unknown()),
  runtimeConfig: z.record(z.unknown()),
  role: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  reportsTo: z.string().nullable(),
  status: z.string(),
  pauseReason: z.string().nullable(),
  pausedAt: zIsoDate.nullable(),
  permissions: z.record(z.unknown()),
  skills: z.array(z.string()),
  deniedSkills: z.array(z.string()).default([]),
  actionCap: z.record(z.unknown()).default({}),
  trustLevel: z.number().default(0),
  marketplaceId: z.string().uuid().nullable().optional(),
  promptTemplate: z.string(),
  allowedTools: z.string(),
  permissionMode: z.string(),
  monthlyTokenBudget: z.number(),
  tokensUsed: z.number(),
  budgetResetAt: zIsoDate.nullable(),
  schedule: z.string().nullable(),
  timeoutSeconds: z.number(),
  requiresApproval: z.boolean(),
  isActive: z.boolean(),
  lastHeartbeatAt: zIsoDate.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
  // Optional include relation
  runtimeState: AgentRuntimeStateSchema.nullable().optional(),
});

// GET /api/agent-registry 목록 응답의 각 item
// 출처: agent-registry.service.ts list() — Prisma AgentDefinition (omit: promptTemplate)
export const AgentListItemSchema = AgentSchema.omit({ promptTemplate: true });

// HeartbeatRun — 에이전트 실행 기록
// 출처: agent-registry.service.ts — Prisma HeartbeatRun 직접 반환
// ⚠️ Date fields: startedAt, finishedAt, createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const HeartbeatRunSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  agentId: z.string(),
  invocationSource: z.string(),
  triggerDetail: z.string().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  failureType: z.enum(HEARTBEAT_FAILURE_TYPES).nullable().optional(),
  startedAt: zIsoDate.nullable(),
  finishedAt: zIsoDate.nullable(),
  error: z.string().nullable(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  usageJson: z.record(z.unknown()).nullable(),
  resultJson: z.record(z.unknown()).nullable(),
  sessionIdBefore: z.string().nullable(),
  sessionIdAfter: z.string().nullable(),
  stdoutExcerpt: z.string().nullable(),
  stderrExcerpt: z.string().nullable(),
  errorCode: z.string().nullable(),
  processPid: z.number().nullable(),
  wakeupRequestId: z.string().nullable(),
  // Phase 3/4 (ADR / prisma/AGENTS.md):
  //  - nextSchedule: Dynamic Cron (#30) — 에이전트가 반환한 다음 cron 문자열
  //  - isSummarized / summary: Selective Clearing (#10) — 오래된 결과 요약 여부 + 본문
  nextSchedule: z.string().nullable().optional(),
  isSummarized: z.boolean().optional(),
  summary: z.string().nullable().optional(),
  triggeredByUserId: z.string().uuid().nullable().optional(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// Cost Analytics — 에이전트 비용 분석 응답
// 출처: agent-types.ts:125-151
export const DailyCostSchema = z.object({
  date: z.string(),
  totalCostCents: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  runCount: z.number(),
});

export const AgentCostSummarySchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  totalCostCents: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  runCount: z.number(),
});

export const CostAnalyticsSchema = z.object({
  daily: z.array(DailyCostSchema),
  byAgent: z.array(AgentCostSummarySchema),
  summary: z.object({
    totalCostCents: z.number(),
    totalInputTokens: z.number(),
    totalOutputTokens: z.number(),
    totalRuns: z.number(),
  }),
});

// 타입 export
export type Agent = z.infer<typeof AgentSchema>;
export type AgentListItem = z.infer<typeof AgentListItemSchema>;
export type HeartbeatRun = z.infer<typeof HeartbeatRunSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
export type DailyCost = z.infer<typeof DailyCostSchema>;
export type AgentCostSummary = z.infer<typeof AgentCostSummarySchema>;
export type CostAnalytics = z.infer<typeof CostAnalyticsSchema>;
