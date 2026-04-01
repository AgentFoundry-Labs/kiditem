import { z } from 'zod';

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
  createdAt: z.string(),
  updatedAt: z.string(),
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
  pausedAt: z.string().nullable(),
  permissions: z.record(z.unknown()),
  skills: z.array(z.string()),
  promptTemplate: z.string(),
  allowedTools: z.string(),
  permissionMode: z.string(),
  monthlyTokenBudget: z.number(),
  tokensUsed: z.number(),
  budgetResetAt: z.string().nullable(),
  schedule: z.string().nullable(),
  timeoutSeconds: z.number(),
  requiresApproval: z.boolean(),
  isActive: z.boolean(),
  lastHeartbeatAt: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Optional include relation
  runtimeState: AgentRuntimeStateSchema.nullable().optional(),
});

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
  status: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
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
export type HeartbeatRun = z.infer<typeof HeartbeatRunSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
export type DailyCost = z.infer<typeof DailyCostSchema>;
export type AgentCostSummary = z.infer<typeof AgentCostSummarySchema>;
export type CostAnalytics = z.infer<typeof CostAnalyticsSchema>;
