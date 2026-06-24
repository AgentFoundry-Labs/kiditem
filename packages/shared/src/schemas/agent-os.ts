import { z } from 'zod';

export const AgentInstanceLifecycleStatusSchema = z.enum([
  'active',
  'paused',
  'disabled',
]);

export const AgentRunRequestStatusSchema = z.enum([
  'pending',
  'claimed',
  'coalesced',
  'skipped',
  'requires_approval',
  'succeeded',
  'failed',
  'cancelled',
]);

export const AgentRunStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const AgentToolPolicyEffectSchema = z.enum([
  'allow',
  'deny',
  'approval_required',
]);

export const AgentToolPolicyApprovalModeSchema = z.enum([
  'none',
  'admin',
  'self',
]);

export const AgentToolPolicyDryRunModeSchema = z.enum([
  'optional',
  'required',
  'disabled',
]);

export const AgentToolPolicySourceSchema = z.enum([
  'definition',
  'instance',
  'missing',
]);

export const AgentAuthorizationDecisionSchema = z.enum([
  'allowed',
  'denied',
  'approval_required',
]);

export const AgentApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);

export const AgentConversationStatusSchema = z.enum(['active', 'archived']);

export const AgentMessageRoleSchema = z.enum([
  'user',
  'assistant',
  'system',
  'tool',
]);

export const AgentToolInvocationStatusSchema = z.enum([
  'requested',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
]);

export const AgentArtifactStatusSchema = z.enum([
  'active',
  'superseded',
  'deleted',
]);

export const AgentRunGraphNodeKindSchema = z.enum([
  'agent_task',
  'tool_invocation',
  'artifact',
  'approval',
]);

export const OperatorDecisionTypeSchema = z.enum([
  'delegate',
  'ask_user',
  'refuse',
]);

export const OperatorDelegationTargetAgentTypeSchema = z.enum([
  'sourcing',
  'listing',
  'order',
  'channel_registration',
]);

const NonEmptyRecordSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Expected at least one task input field',
  });

export const OperatorDelegateDecisionSchema = z
  .object({
    decisionType: z.literal('delegate'),
    targetAgentType: OperatorDelegationTargetAgentTypeSchema,
    playbookKey: z.string().trim().min(1),
    taskInput: NonEmptyRecordSchema,
    userVisibleRationale: z.string().trim().min(1),
  })
  .strict();

export const OperatorAskUserDecisionSchema = z
  .object({
    decisionType: z.literal('ask_user'),
    question: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();

export const OperatorRefuseDecisionSchema = z
  .object({
    decisionType: z.literal('refuse'),
    reason: z.string().trim().min(1),
  })
  .strict();

export const OperatorDecisionSchema = z.discriminatedUnion('decisionType', [
  OperatorDelegateDecisionSchema,
  OperatorAskUserDecisionSchema,
  OperatorRefuseDecisionSchema,
]);

export const AgentHandoffTriggerSchema = z.enum(['user_selection']);

export const AgentHandoffIntentSchema = z
  .object({
    targetAgentType: OperatorDelegationTargetAgentTypeSchema,
    playbookKey: z.string().trim().min(1),
    planStepKey: z.string().trim().min(1),
    trigger: AgentHandoffTriggerSchema,
    requiresUserSelection: z.boolean(),
    actionLabel: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (value) =>
      value.trigger !== 'user_selection' || value.requiresUserSelection === true,
    { message: 'user_selection handoffs require user selection' },
  );

export const AgentArtifactHandoffSummarySchema = z
  .object({
    handoffIntent: AgentHandoffIntentSchema,
  })
  .passthrough();

export const AgentDefinitionRuntimeKindSchema = z.enum([
  'agent',
  'coordinator',
  'tool_wrapper',
]);

export const AgentDefinitionDelegationRoleSchema = z.enum([
  'orchestrator',
  'leaf',
]);

export const AgentSkillModeSchema = z.enum([
  'development_workflow',
  'runtime_playbook',
]);

export const CreateAgentRunRequestSchema = z.object({
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

export const AgentRunnerResultSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().optional(),
  runId: z.string().optional(),
  agentInstanceId: z.string().optional(),
  agentType: z.string().optional(),
  status: z.string().optional(),
  reason: z.string().optional(),
});

export const AgentDefinitionSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  promptPath: z.string(),
  defaultAdapterType: z.string(),
  defaultModelEnv: z.string(),
  defaultRuntimeConfig: z.record(z.string(), z.unknown()),
  defaultCapabilities: z.record(z.string(), z.unknown()),
  defaultSkillKeys: z.array(z.string()),
  runtimeKind: AgentDefinitionRuntimeKindSchema,
  delegationRole: AgentDefinitionDelegationRoleSchema,
  catalogStatus: z.string(),
  marketplaceId: z.string().nullable(),
});

export const AgentSkillSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  version: z.string(),
  skillPath: z.string(),
  defaultPreload: z.boolean(),
  allowedAgentTypes: z.array(z.string()),
  mode: AgentSkillModeSchema,
});

export const AgentInstanceSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: z.string(),
  name: z.string(),
  role: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  reportsToId: z.string().nullable(),
  lifecycleStatus: AgentInstanceLifecycleStatusSchema,
  pauseReason: z.string().nullable(),
  trustLevel: z.number().int(),
  adapterType: z.string(),
  modelOverride: z.string().nullable(),
  effectiveModel: z.string(),
});

export const AgentInstanceToolPolicySummarySchema = z.object({
  toolKey: z.string(),
  effect: AgentToolPolicyEffectSchema,
  source: AgentToolPolicySourceSchema,
  approvalMode: AgentToolPolicyApprovalModeSchema,
  dryRunMode: AgentToolPolicyDryRunModeSchema,
  constraints: z.record(z.string(), z.unknown()),
});

export const AgentRunRequestSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  agentType: z.string(),
  taskKey: z.string(),
  source: z.string(),
  sourceResourceType: z.string().nullable(),
  sourceResourceId: z.string().nullable(),
  sourceWorkflowRunId: z.string().nullable(),
  status: AgentRunRequestStatusSchema,
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
export const AgentRunSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  requestId: z.string(),
  agentInstanceId: z.string(),
  agentType: z.string().optional(),
  taskKey: z.string().nullable(),
  status: AgentRunStatusSchema,
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

export const AgentRunEventSummarySchema = z.object({
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

export const AgentConversationSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  title: z.string(),
  status: AgentConversationStatusSchema,
  createdByUserId: z.string().nullable(),
  rootRequestId: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AgentMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: AgentMessageRoleSchema,
  content: z.string(),
  agentInstanceId: z.string().nullable(),
  requestId: z.string().nullable(),
  runId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const SendAgentMessageSchema = z.object({
  content: z.string().trim().min(1).max(12000),
});

export const SelectSourcingRecommendationSchema = z.object({
  artifactId: z.string().min(1),
});

export const ResolveAgentApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decisionReason: z.string().trim().max(2000).optional(),
});

export const AgentApprovalRequestSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  requestId: z.string(),
  runId: z.string().nullable(),
  status: AgentApprovalStatusSchema,
  reasonCode: z.string().nullable(),
  reason: z.string().nullable(),
  prompt: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  actionSnapshot: z.record(z.string(), z.unknown()).nullable(),
  requestedByActorType: z.string().nullable(),
  requestedByActorId: z.string().nullable(),
  requestedByUserId: z.string().nullable(),
  approverUserId: z.string().nullable(),
  decidedByUserId: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionReason: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AgentToolInvocationSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  requestId: z.string().nullable(),
  runId: z.string().nullable(),
  approvalRequestId: z.string().nullable(),
  capabilityKey: z.string(),
  status: AgentToolInvocationStatusSchema,
  policyDecision: AgentAuthorizationDecisionSchema,
  reasonCode: z.string().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  inputSummary: z.record(z.string(), z.unknown()),
  outputSummary: z.record(z.string(), z.unknown()).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const AgentArtifactSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  requestId: z.string().nullable(),
  runId: z.string().nullable(),
  toolInvocationId: z.string().nullable(),
  artifactType: z.string(),
  targetDomain: z.string(),
  targetModel: z.string(),
  targetId: z.string().nullable(),
  title: z.string(),
  href: z.string().nullable(),
  summary: z.record(z.string(), z.unknown()),
  status: AgentArtifactStatusSchema,
  createdAt: z.string(),
});

export const AgentRunGraphNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  kind: AgentRunGraphNodeKindSchema,
  label: z.string(),
  status: z.string(),
  agentType: z.string().nullable(),
  capabilityKey: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const AgentRunGraphSchema = z.object({
  conversationId: z.string(),
  rootRequestId: z.string().nullable(),
  nodes: z.array(AgentRunGraphNodeSchema),
  artifacts: z.array(AgentArtifactSummarySchema),
  toolInvocations: z.array(AgentToolInvocationSummarySchema),
});

export const AgentOsLiveReadinessStatusSchema = z.enum([
  'ready',
  'missing',
  'blocked',
]);

export const AgentOsLiveReadinessCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: AgentOsLiveReadinessStatusSchema,
  detail: z.string(),
  requiredFor: z.array(z.string()),
  remediation: z.string().nullable(),
});

export const AgentOsLiveReadinessResponseSchema = z.object({
  checks: z.array(AgentOsLiveReadinessCheckSchema),
  allReady: z.boolean(),
  runnableCapabilities: z.array(z.string()),
  blockedCapabilities: z.array(z.string()),
});

export const AgentCostEventSummarySchema = z.object({
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

export const AgentAuthorizationEventSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentInstanceId: z.string(),
  requestId: z.string().nullable(),
  runId: z.string().nullable(),
  toolKey: z.string().nullable(),
  action: z.string(),
  decision: AgentAuthorizationDecisionSchema,
  reasonCode: z.string().nullable(),
  reason: z.string().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  createdAt: z.string(),
});

export type AgentInstanceLifecycleStatus = z.infer<typeof AgentInstanceLifecycleStatusSchema>;
export type AgentRunRequestStatus = z.infer<typeof AgentRunRequestStatusSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentToolPolicyEffect = z.infer<typeof AgentToolPolicyEffectSchema>;
export type AgentToolPolicyApprovalMode = z.infer<typeof AgentToolPolicyApprovalModeSchema>;
export type AgentToolPolicyDryRunMode = z.infer<typeof AgentToolPolicyDryRunModeSchema>;
export type AgentToolPolicySource = z.infer<typeof AgentToolPolicySourceSchema>;
export type AgentAuthorizationDecision = z.infer<typeof AgentAuthorizationDecisionSchema>;
export type AgentApprovalStatus = z.infer<typeof AgentApprovalStatusSchema>;
export type AgentConversationStatus = z.infer<typeof AgentConversationStatusSchema>;
export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;
export type AgentToolInvocationStatus = z.infer<typeof AgentToolInvocationStatusSchema>;
export type AgentArtifactStatus = z.infer<typeof AgentArtifactStatusSchema>;
export type AgentRunGraphNodeKind = z.infer<typeof AgentRunGraphNodeKindSchema>;
export type OperatorDecisionType = z.infer<typeof OperatorDecisionTypeSchema>;
export type OperatorDelegationTargetAgentType = z.infer<typeof OperatorDelegationTargetAgentTypeSchema>;
export type OperatorDelegateDecision = z.infer<typeof OperatorDelegateDecisionSchema>;
export type OperatorAskUserDecision = z.infer<typeof OperatorAskUserDecisionSchema>;
export type OperatorRefuseDecision = z.infer<typeof OperatorRefuseDecisionSchema>;
export type OperatorDecision = z.infer<typeof OperatorDecisionSchema>;
export type AgentHandoffTrigger = z.infer<typeof AgentHandoffTriggerSchema>;
export type AgentHandoffIntent = z.infer<typeof AgentHandoffIntentSchema>;
export type AgentArtifactHandoffSummary = z.infer<
  typeof AgentArtifactHandoffSummarySchema
>;
export type AgentDefinitionRuntimeKind = z.infer<typeof AgentDefinitionRuntimeKindSchema>;
export type AgentDefinitionDelegationRole = z.infer<
  typeof AgentDefinitionDelegationRoleSchema
>;
export type AgentSkillMode = z.infer<typeof AgentSkillModeSchema>;
export type CreateAgentRunRequest = z.infer<typeof CreateAgentRunRequestSchema>;
export type AgentRunnerResult = z.infer<typeof AgentRunnerResultSchema>;
export type AgentDefinitionSummary = z.infer<typeof AgentDefinitionSummarySchema>;
export type AgentSkillSummary = z.infer<typeof AgentSkillSummarySchema>;
export type AgentInstanceSummary = z.infer<typeof AgentInstanceSummarySchema>;
export type AgentInstanceToolPolicySummary = z.infer<typeof AgentInstanceToolPolicySummarySchema>;
export type AgentRunRequestSummary = z.infer<typeof AgentRunRequestSummarySchema>;
export type AgentRunSummary = z.infer<typeof AgentRunSummarySchema>;
export type AgentRunEventSummary = z.infer<typeof AgentRunEventSummarySchema>;
export type AgentConversationSummary = z.infer<typeof AgentConversationSummarySchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type SendAgentMessage = z.infer<typeof SendAgentMessageSchema>;
export type SelectSourcingRecommendation = z.infer<typeof SelectSourcingRecommendationSchema>;
export type ResolveAgentApproval = z.infer<typeof ResolveAgentApprovalSchema>;
export type AgentApprovalRequestSummary = z.infer<typeof AgentApprovalRequestSummarySchema>;
export type AgentToolInvocationSummary = z.infer<typeof AgentToolInvocationSummarySchema>;
export type AgentArtifactSummary = z.infer<typeof AgentArtifactSummarySchema>;
export type AgentRunGraphNode = z.infer<typeof AgentRunGraphNodeSchema>;
export type AgentRunGraph = z.infer<typeof AgentRunGraphSchema>;
export type AgentOsLiveReadinessStatus = z.infer<typeof AgentOsLiveReadinessStatusSchema>;
export type AgentOsLiveReadinessCheck = z.infer<typeof AgentOsLiveReadinessCheckSchema>;
export type AgentOsLiveReadinessResponse = z.infer<typeof AgentOsLiveReadinessResponseSchema>;
export type AgentCostEventSummary = z.infer<typeof AgentCostEventSummarySchema>;
export type AgentAuthorizationEventSummary = z.infer<typeof AgentAuthorizationEventSummarySchema>;
