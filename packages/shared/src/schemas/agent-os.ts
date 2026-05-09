import { z } from 'zod';

export const agentInstanceLifecycleStatusSchema = z.enum([
  'active',
  'paused',
  'disabled',
]);

export const agentRunRequestStatusSchema = z.enum([
  'pending',
  'claimed',
  'coalesced',
  'skipped',
  'requires_approval',
  'succeeded',
  'failed',
  'cancelled',
]);

export const agentRunStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const agentToolPolicyEffectSchema = z.enum([
  'allow',
  'deny',
  'approval_required',
]);

export const agentAuthorizationDecisionSchema = z.enum([
  'allowed',
  'denied',
  'approval_required',
]);

export const agentApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);

export const agentDefinitionRuntimeKindSchema = z.enum([
  'agent',
  'coordinator',
  'tool_wrapper',
]);

export const createAgentRunRequestSchema = z.object({
  agentType: z.string().min(1),
  taskKey: z.string().min(1).default('default'),
  idempotencyKey: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  sourceType: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  sourceWorkflowRunId: z.string().uuid().optional(),
  sourceWorkflowNodeId: z.string().min(1).optional(),
  sourceResourceType: z.string().min(1).optional(),
  sourceResourceId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  scheduledFor: z.string().datetime().optional(),
  reason: z.string().optional(),
  triggerDetail: z.string().optional(),
  dryRun: z.boolean().default(false),
});

export const agentRunnerResultSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().optional(),
  runId: z.string().optional(),
  agentInstanceId: z.string().optional(),
  agentType: z.string().optional(),
  status: z.string().optional(),
  reason: z.string().optional(),
});

export const agentDefinitionSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  promptPath: z.string(),
  defaultAdapterType: z.string(),
  defaultModelEnv: z.string(),
  defaultRuntimeConfig: z.record(z.string(), z.unknown()),
  defaultCapabilities: z.record(z.string(), z.unknown()),
  runtimeKind: agentDefinitionRuntimeKindSchema,
  catalogStatus: z.string(),
  marketplaceId: z.string().nullable(),
});

export const agentInstanceSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: z.string(),
  name: z.string(),
  role: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  reportsToId: z.string().nullable(),
  lifecycleStatus: agentInstanceLifecycleStatusSchema,
  pauseReason: z.string().nullable(),
  trustLevel: z.number().int(),
  adapterType: z.string(),
  modelOverride: z.string().nullable(),
  effectiveModel: z.string(),
});

export const agentRunRequestSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  agentType: z.string(),
  taskKey: z.string(),
  source: z.string(),
  sourceResourceType: z.string().nullable(),
  sourceResourceId: z.string().nullable(),
  sourceWorkflowRunId: z.string().nullable(),
  status: agentRunRequestStatusSchema,
  priority: z.number().int(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  scheduledFor: z.string(),
  claimedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  latestRunId: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  createdAt: z.string(),
});

// AgentRunSummary mirrors the server's GET /agent-os/runs/:id response
// (apps/server/src/agent-os/adapter/out/repository/agent-os.repository.adapter.ts
// → toRunRecord). agentType/costMicros are not stored on AgentRun directly —
// `agentType` is derived via the parent instance, `costMicros` aggregated from
// the cost-event ledger. Both are optional here so the schema admits the
// raw run-row response without forcing the server to do extra joins on every
// list call. Consumers that need them should fetch through the dedicated cost
// endpoint or instance lookup.
export const agentRunSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  requestId: z.string(),
  agentInstanceId: z.string(),
  agentType: z.string().optional(),
  taskKey: z.string().nullable(),
  status: agentRunStatusSchema,
  attempt: z.number().int(),
  invocationSource: z.string(),
  adapterType: z.string(),
  model: z.string(),
  provider: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  // Raw runtime output JSON. Web consumers (sourcing color-guide, image edit,
  // detail-page generator) read fields like `image_url` / `step` from here.
  output: z.record(z.string(), z.unknown()).nullable().optional(),
  costMicros: z.string().nullable().optional(),
});

export const agentRunEventSummarySchema = z.object({
  id: z.string(),
  runId: z.string(),
  seq: z.number().int(),
  type: z.string(),
  level: z.string(),
  stream: z.string().nullable(),
  message: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  logRef: z.string().nullable(),
  createdAt: z.string(),
});

export const agentCostEventSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  requestId: z.string(),
  runId: z.string(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedInputTokens: z.number().int(),
  costMicros: z.string(),
  occurredAt: z.string(),
});

export const agentAuthorizationEventSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  requestId: z.string().nullable(),
  runId: z.string().nullable(),
  toolKey: z.string().nullable(),
  action: z.string(),
  decision: agentAuthorizationDecisionSchema,
  reasonCode: z.string().nullable(),
  reason: z.string().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  createdAt: z.string(),
});

export type AgentInstanceLifecycleStatus = z.infer<typeof agentInstanceLifecycleStatusSchema>;
export type AgentRunRequestStatus = z.infer<typeof agentRunRequestStatusSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AgentToolPolicyEffect = z.infer<typeof agentToolPolicyEffectSchema>;
export type AgentAuthorizationDecision = z.infer<typeof agentAuthorizationDecisionSchema>;
export type AgentApprovalStatus = z.infer<typeof agentApprovalStatusSchema>;
export type AgentDefinitionRuntimeKind = z.infer<typeof agentDefinitionRuntimeKindSchema>;
export type CreateAgentRunRequestInput = z.infer<typeof createAgentRunRequestSchema>;
export type AgentRunnerResult = z.infer<typeof agentRunnerResultSchema>;
export type AgentDefinitionSummary = z.infer<typeof agentDefinitionSummarySchema>;
export type AgentInstanceSummary = z.infer<typeof agentInstanceSummarySchema>;
export type AgentRunRequestSummary = z.infer<typeof agentRunRequestSummarySchema>;
export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>;
export type AgentRunEventSummary = z.infer<typeof agentRunEventSummarySchema>;
export type AgentCostEventSummary = z.infer<typeof agentCostEventSummarySchema>;
export type AgentAuthorizationEventSummary = z.infer<typeof agentAuthorizationEventSummarySchema>;
