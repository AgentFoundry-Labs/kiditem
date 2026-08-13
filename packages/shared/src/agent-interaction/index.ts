import { z } from 'zod';

const positiveDecimalStringSchema = z.string().regex(/^[1-9][0-9]*$/);
const nonNegativeDecimalStringSchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/);
const opaqueCursorSchema = z.string().min(16).max(4096);
const boundedIdentifierSchema = z.string().min(1).max(128);
const stableCodeSchema = boundedIdentifierSchema.regex(
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
);
const boundedContentSchema = z.string().min(1).max(100_000);

export const InteractionPrincipalSchema = z
  .object({
    principalKey: z.string().min(8),
    userId: z.string().min(1),
    organizationId: z.string().min(1),
  })
  .strict();

export const AllowedAgentSchema = z
  .object({
    agentDefinitionKey: z.string().min(1),
    agentVersionId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().min(1),
    isDefault: z.boolean(),
  })
  .strict();

export const AgentSessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    copilotThreadId: z.string().min(1),
    primaryAgentDefinitionKey: z.string().min(1),
    primaryAgentVersionId: z.string().min(1),
    lifecycle: z.enum(['active', 'completed', 'cancelled', 'archived']),
    updatedAt: z.string().datetime(),
  })
  .strict();

const requireOneMatchingDefault = (
  value: {
    defaultAgentDefinitionKey: string;
    agents: Array<z.infer<typeof AllowedAgentSchema>>;
  },
  context: z.RefinementCtx,
) => {
  const defaults = value.agents.filter((candidate) => candidate.isDefault);
  if (
    defaults.length !== 1 ||
    defaults[0].agentDefinitionKey !== value.defaultAgentDefinitionKey
  ) {
    context.addIssue({
      code: 'custom',
      message: 'bootstrap requires exactly one matching default agent',
      path: ['agents'],
    });
  }

  const identities = value.agents.map((candidate) =>
    JSON.stringify([
      candidate.agentDefinitionKey,
      candidate.agentVersionId,
    ]),
  );
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: 'custom',
      message: 'bootstrap requires unique allowed-agent identities',
      path: ['agents'],
    });
  }
};

export const InteractionBootstrapSchema = z
  .object({
    defaultAgentDefinitionKey: z.string().min(1),
    agents: z.array(AllowedAgentSchema).min(1),
    sessions: z.array(AgentSessionSummarySchema),
  })
  .strict()
  .superRefine(requireOneMatchingDefault);

export const CanonicalResourceRefSchema = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1),
    version: z.string().min(1).nullable(),
  })
  .strict();

export const DashboardContextSchema = z.object({
  routeKey: z.string().min(1),
  resourceRefs: z.array(CanonicalResourceRefSchema).max(50).default([]),
  filters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    )
    .default({}),
  visibleRowIds: z.array(z.string().min(1)).max(100).default([]),
  aggregateSummary: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(64),
});

export const AguiRunIntentSchema = z
  .object({
    runIntent: z.string().min(32),
    expiresAt: z.string().datetime(),
    copilotThreadId: z.string().min(1),
    aguiRunId: z.string().min(1),
  })
  .strict();

export const AguiRunAuthorizationSchema = z
  .object({
    session: AgentSessionSummarySchema,
    sessionTaskId: z.string().min(1),
    executionId: z.string().min(1),
    modelIdentity: z.string().min(1),
    runtimeType: z.string().min(1),
    policySnapshotId: z.string().min(1),
    contextEpoch: z.number().int().positive(),
    dashboardContext: DashboardContextSchema,
  })
  .strict();

export const AgentCorrelationSchema = z
  .object({
    copilotThreadId: z.string().min(1),
    aguiRunId: z.string().min(1),
    executionId: z.string().min(1),
    sessionId: z.string().min(1),
    sessionTaskId: z.string().min(1),
    attemptId: z.string().min(1).nullable().default(null),
    operationsRunId: z.string().min(1).nullable(),
  })
  .strict();

export const AgentConversationEventTypeSchema = z.enum([
  'user_message',
  'assistant_message',
  'system_notice',
  'tool_activity',
  'state_snapshot',
  'hitl_request',
  'hitl_decision',
  'run_terminal',
]);

export const MessageEventPayloadSchema = z
  .object({
    messageId: boundedIdentifierSchema,
    content: boundedContentSchema,
  })
  .strict();

export const SystemNoticeEventPayloadSchema = z
  .object({
    code: stableCodeSchema,
    content: boundedContentSchema,
  })
  .strict();

export const ToolActivityEventPayloadSchema = z
  .object({
    toolCallId: boundedIdentifierSchema,
    toolName: boundedIdentifierSchema.regex(
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    ),
    status: z.enum(['started', 'completed', 'failed', 'cancelled']),
  })
  .strict();

export const StateSnapshotEventPayloadSchema = z
  .object({
    snapshotType: stableCodeSchema,
    snapshotVersion: z.number().int().positive(),
    data: z
      .object({
        content: boundedContentSchema,
      })
      .strict(),
  })
  .strict();

export const HitlRequestEventPayloadSchema = z
  .object({
    requestId: boundedIdentifierSchema,
    status: z.literal('pending'),
    prompt: z.string().min(1).max(20_000),
  })
  .strict();

export const HitlDecisionEventPayloadSchema = z
  .object({
    requestId: boundedIdentifierSchema,
    decision: z.enum(['approved', 'rejected', 'cancelled']),
  })
  .strict();

export const RunTerminalEventPayloadSchema = z
  .object({
    status: z.enum(['completed', 'failed', 'cancelled']),
    errorCode: stableCodeSchema.nullable(),
  })
  .strict();

const conversationEventBaseShape = {
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  executionId: z.string().min(1).nullable(),
  sequence: positiveDecimalStringSchema,
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime(),
};

export const AgentConversationEventEnvelopeSchema = z.discriminatedUnion(
  'eventType',
  [
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('user_message'),
        payload: MessageEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('assistant_message'),
        payload: MessageEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('system_notice'),
        payload: SystemNoticeEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('tool_activity'),
        payload: ToolActivityEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('state_snapshot'),
        payload: StateSnapshotEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('hitl_request'),
        payload: HitlRequestEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('hitl_decision'),
        payload: HitlDecisionEventPayloadSchema,
      })
      .strict(),
    z
      .object({
        ...conversationEventBaseShape,
        eventType: z.literal('run_terminal'),
        payload: RunTerminalEventPayloadSchema,
      })
      .strict(),
  ],
);

export const AgentConversationReplaySchema = z
  .object({
    sessionId: z.string().min(1),
    events: z.array(AgentConversationEventEnvelopeSchema).max(500),
    nextCursor: opaqueCursorSchema.nullable(),
    lastSequence: nonNegativeDecimalStringSchema,
  })
  .strict();

export const AgentConversationReplayRequestSchema = z
  .object({
    copilotThreadId: z.string().min(1),
    cursor: opaqueCursorSchema.nullable().optional(),
  })
  .strict();

export const AguiConnectionAuthorizationSchema = z
  .object({
    session: AgentSessionSummarySchema,
    contextEpoch: z.number().int().positive(),
    replay: AgentConversationReplaySchema,
    liveJoinToken: z.string().min(32).max(4096),
    liveJoinExpiresAt: z.string().datetime(),
  })
  .strict();

export type InteractionPrincipal = z.infer<typeof InteractionPrincipalSchema>;
export type AllowedAgent = z.infer<typeof AllowedAgentSchema>;
export type AgentSessionSummary = z.infer<typeof AgentSessionSummarySchema>;
export type InteractionBootstrap = z.infer<typeof InteractionBootstrapSchema>;
export type CanonicalResourceRef = z.infer<typeof CanonicalResourceRefSchema>;
export type DashboardContext = z.infer<typeof DashboardContextSchema>;
export type AguiRunIntent = z.infer<typeof AguiRunIntentSchema>;
export type AguiRunAuthorization = z.infer<typeof AguiRunAuthorizationSchema>;
export type AgentCorrelation = z.infer<typeof AgentCorrelationSchema>;
export type AgentConversationEventType = z.infer<
  typeof AgentConversationEventTypeSchema
>;
export type MessageEventPayload = z.infer<typeof MessageEventPayloadSchema>;
export type SystemNoticeEventPayload = z.infer<
  typeof SystemNoticeEventPayloadSchema
>;
export type ToolActivityEventPayload = z.infer<
  typeof ToolActivityEventPayloadSchema
>;
export type StateSnapshotEventPayload = z.infer<
  typeof StateSnapshotEventPayloadSchema
>;
export type HitlRequestEventPayload = z.infer<
  typeof HitlRequestEventPayloadSchema
>;
export type HitlDecisionEventPayload = z.infer<
  typeof HitlDecisionEventPayloadSchema
>;
export type RunTerminalEventPayload = z.infer<
  typeof RunTerminalEventPayloadSchema
>;
export type AgentConversationEventEnvelope = z.infer<
  typeof AgentConversationEventEnvelopeSchema
>;
export type AgentConversationReplay = z.infer<
  typeof AgentConversationReplaySchema
>;
export type AgentConversationReplayRequest = z.infer<
  typeof AgentConversationReplayRequestSchema
>;
export type AguiConnectionAuthorization = z.infer<
  typeof AguiConnectionAuthorizationSchema
>;
