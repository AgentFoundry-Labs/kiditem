import { z } from "zod";
import {
  AgentConversationEventNameSchema,
  AgentDefinitionKeySchema,
  AgentExecutionAttemptNameSchema,
  AgentExecutionNameSchema,
  AgentSessionNameSchema,
  AgentSessionTaskNameSchema,
  AgentVersionNameSchema,
  AguiRunIdSchema,
  CopilotThreadIdSchema,
  formatOrganizationName,
  NonNegativeDecimalSequenceSchema,
  OpaqueReplayCursorSchema,
  OpaqueShortLivedTokenSchema,
  OperationRunNameSchema,
  parseAgentConversationEventName,
  parseAgentExecutionAttemptName,
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  parseAgentVersionName,
  parseOperationRunName,
  PositiveDecimalSequenceSchema,
  RequestIdSchema,
  Sha256DigestSchema,
  ToolCallIdSchema,
} from "../identifiers";
import { CanonicalResourceRefSchema } from "./resource-ref";
import { InteractionUiResultSchema } from "./ui";

export {
  AgentApprovalCardSchema,
  AgentApprovalDecisionSchema,
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
  AgentTaskStatusSchema,
  CancelAgentTaskSchema,
  ResumeAgentTaskSchema,
  RetryAgentTaskSchema,
} from "./durable-runtime";
export type {
  AgentApprovalCard,
  AgentApprovalDecision,
  AgentArtifactCard,
  AgentDelegationEvent,
  AgentProgressEvent,
  AgentTaskStatus,
  CancelAgentTask,
  ResumeAgentTask,
  RetryAgentTask,
} from "./durable-runtime";

export { CanonicalResourceRefSchema } from "./resource-ref";
export type { CanonicalResourceRef } from "./resource-ref";

const boundedIdentifierSchema = z.string().min(1).max(128);
const stableCodeSchema = boundedIdentifierSchema.regex(
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
);
const boundedContentSchema = z.string().min(1).max(100_000);

const addCanonicalNameIssue = (
  context: z.RefinementCtx,
  path: string[],
  message: string,
) => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
};

const hasMatchingNameParent = (parse: () => unknown) => {
  try {
    parse();
    return true;
  } catch {
    return false;
  }
};

export const AllowedAgentSchema = z
  .object({
    agentDefinitionKey: AgentDefinitionKeySchema,
    agentVersion: AgentVersionNameSchema,
    displayName: z.string().min(1),
    description: z.string().min(1),
    isDefault: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !hasMatchingNameParent(() => {
        const version = parseAgentVersionName(value.agentVersion);
        if (version.agentDefinitionKey !== value.agentDefinitionKey) {
          throw new Error("Agent version does not match agent definition");
        }
      })
    ) {
      addCanonicalNameIssue(
        context,
        ["agentVersion"],
        "agent version must belong to the allowed agent definition",
      );
    }
  });

export const AgentSessionSummarySchema = z
  .object({
    name: AgentSessionNameSchema,
    copilotThreadId: CopilotThreadIdSchema,
    primaryAgentDefinitionKey: AgentDefinitionKeySchema,
    primaryAgentVersion: AgentVersionNameSchema,
    lifecycle: z.enum(["active", "completed", "cancelled", "archived"]),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !hasMatchingNameParent(() => {
        const version = parseAgentVersionName(value.primaryAgentVersion);
        if (version.agentDefinitionKey !== value.primaryAgentDefinitionKey) {
          throw new Error(
            "Primary agent version does not match agent definition",
          );
        }
      })
    ) {
      addCanonicalNameIssue(
        context,
        ["primaryAgentVersion"],
        "primary agent version must belong to the primary agent definition",
      );
    }
  });

const requireOneMatchingDefault = (
  value: {
    defaultAgentDefinitionKey: z.infer<typeof AgentDefinitionKeySchema>;
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
      code: z.ZodIssueCode.custom,
      message: "bootstrap requires exactly one matching default agent",
      path: ["agents"],
    });
  }

  const identities = value.agents.map((candidate) =>
    JSON.stringify([candidate.agentDefinitionKey, candidate.agentVersion]),
  );
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bootstrap requires unique allowed-agent identities",
      path: ["agents"],
    });
  }
};

export const InteractionBootstrapSchema = z
  .object({
    defaultAgentDefinitionKey: AgentDefinitionKeySchema,
    agents: z.array(AllowedAgentSchema).min(1),
    sessions: z.array(AgentSessionSummarySchema),
  })
  .strict()
  .superRefine(requireOneMatchingDefault);

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
    runIntent: OpaqueShortLivedTokenSchema,
    expiresAt: z.string().datetime(),
    copilotThreadId: CopilotThreadIdSchema,
    aguiRunId: AguiRunIdSchema,
  })
  .strict();

export const AguiRunAuthorizationSchema = z
  .object({
    session: AgentSessionNameSchema,
    task: AgentSessionTaskNameSchema,
    execution: AgentExecutionNameSchema,
    modelIdentity: z.string().min(1),
    runtimeType: z.string().min(1),
    policyHash: Sha256DigestSchema,
    contextEpoch: z.number().int().positive(),
    dashboardContext: DashboardContextSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !hasMatchingNameParent(() =>
        parseAgentSessionTaskName(value.task, value.session),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["task"],
        "task must belong to the authorized session",
      );
    }
    if (
      !hasMatchingNameParent(() =>
        parseAgentExecutionName(value.execution, value.session),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["execution"],
        "execution must belong to the authorized session",
      );
    }
  });

export const AgentCorrelationSchema = z
  .object({
    copilotThreadId: CopilotThreadIdSchema,
    aguiRunId: AguiRunIdSchema,
    session: AgentSessionNameSchema,
    task: AgentSessionTaskNameSchema,
    execution: AgentExecutionNameSchema,
    attempt: AgentExecutionAttemptNameSchema.nullable(),
    operation: OperationRunNameSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !hasMatchingNameParent(() =>
        parseAgentSessionTaskName(value.task, value.session),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["task"],
        "task must belong to the session",
      );
    }
    if (
      !hasMatchingNameParent(() =>
        parseAgentExecutionName(value.execution, value.session),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["execution"],
        "execution must belong to the session",
      );
    }
    if (
      value.attempt !== null &&
      !hasMatchingNameParent(() =>
        parseAgentExecutionAttemptName(value.attempt, value.execution),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["attempt"],
        "attempt must belong to the execution",
      );
    }
    if (
      value.operation !== null &&
      !hasMatchingNameParent(() => {
        const session = parseAgentSessionName(value.session);
        parseOperationRunName(
          value.operation,
          formatOrganizationName(session.organization),
        );
      })
    ) {
      addCanonicalNameIssue(
        context,
        ["operation"],
        "operation must belong to the session organization",
      );
    }
  });

export const AgentConversationEventTypeSchema = z.enum([
  "user_message",
  "assistant_message",
  "system_notice",
  "tool_activity",
  "state_snapshot",
  "hitl_request",
  "hitl_decision",
  "run_terminal",
]);

const completeMessageEventPayloadSchema = z
  .object({
    phase: z.literal("complete"),
    messageId: boundedIdentifierSchema,
    content: boundedContentSchema,
  })
  .strict();
const startMessageEventPayloadSchema = z
  .object({
    phase: z.literal("start"),
    messageId: boundedIdentifierSchema,
  })
  .strict();
const deltaMessageEventPayloadSchema = z
  .object({
    phase: z.literal("delta"),
    messageId: boundedIdentifierSchema,
    content: boundedContentSchema,
  })
  .strict();
const endMessageEventPayloadSchema = z
  .object({
    phase: z.literal("end"),
    messageId: boundedIdentifierSchema,
  })
  .strict();

export const MessageEventPayloadSchema = z.union([
  completeMessageEventPayloadSchema,
  startMessageEventPayloadSchema,
  deltaMessageEventPayloadSchema,
  endMessageEventPayloadSchema,
]);
export const UserMessageEventPayloadSchema = completeMessageEventPayloadSchema;

export const SystemNoticeEventPayloadSchema = z
  .object({
    code: stableCodeSchema,
    content: boundedContentSchema,
  })
  .strict();

export const ToolActivityEventPayloadSchema = z
  .object({
    toolCallId: ToolCallIdSchema,
    toolName: boundedIdentifierSchema.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    status: z.enum(["started", "completed", "failed", "cancelled"]),
  })
  .strict();

const toolResultStateSnapshotEventPayloadSchema = z
  .object({
    snapshotType: z.literal("tool_result"),
    snapshotVersion: z.literal(1),
    data: z
      .object({
        messageId: boundedIdentifierSchema,
        toolCallId: ToolCallIdSchema,
        result: InteractionUiResultSchema,
      })
      .strict(),
  })
  .strict();

const conversationSummaryStateSnapshotEventPayloadSchema = z
  .object({
    snapshotType: z.literal("conversation_summary"),
    snapshotVersion: z.number().int().positive(),
    data: z
      .object({
        content: boundedContentSchema,
        sourceFromSequence: PositiveDecimalSequenceSchema,
        sourceThroughSequence: PositiveDecimalSequenceSchema,
        sourceHash: Sha256DigestSchema,
        summarizerModelIdentity: z.string().min(1).max(256),
        summaryPromptHash: Sha256DigestSchema,
      })
      .strict(),
  })
  .strict();

const genericStateSnapshotEventPayloadSchema = z
  .object({
    snapshotType: stableCodeSchema.refine(
      (value) => value !== "tool_result" && value !== "conversation_summary",
    ),
    snapshotVersion: z.number().int().positive(),
    data: z
      .object({
        content: boundedContentSchema,
      })
      .strict(),
  })
  .strict();

export const StateSnapshotEventPayloadSchema = z.union([
  toolResultStateSnapshotEventPayloadSchema,
  conversationSummaryStateSnapshotEventPayloadSchema,
  genericStateSnapshotEventPayloadSchema,
]);

export const HitlRequestEventPayloadSchema = z
  .object({
    requestId: RequestIdSchema,
    status: z.literal("pending"),
    prompt: z.string().min(1).max(20_000),
  })
  .strict();

export const HitlDecisionEventPayloadSchema = z
  .object({
    requestId: RequestIdSchema,
    decision: z.enum(["approved", "rejected", "cancelled"]),
  })
  .strict();

export const RunTerminalEventPayloadSchema = z
  .object({
    status: z.enum(["completed", "failed", "cancelled"]),
    errorCode: stableCodeSchema.nullable(),
  })
  .strict();

const eventContentSchema = <
  const EventType extends z.infer<typeof AgentConversationEventTypeSchema>,
  Payload extends z.ZodTypeAny,
>(
  eventType: EventType,
  payload: Payload,
) =>
  z
    .object({
      eventType: z.literal(eventType),
      schemaVersion: z.literal(1),
      payload,
    })
    .strict();

const userMessageEventContentSchema = eventContentSchema(
  "user_message",
  UserMessageEventPayloadSchema,
);
const assistantMessageEventContentSchema = eventContentSchema(
  "assistant_message",
  MessageEventPayloadSchema,
);
const systemNoticeEventContentSchema = eventContentSchema(
  "system_notice",
  SystemNoticeEventPayloadSchema,
);
const toolActivityEventContentSchema = eventContentSchema(
  "tool_activity",
  ToolActivityEventPayloadSchema,
);
const stateSnapshotEventContentSchema = eventContentSchema(
  "state_snapshot",
  StateSnapshotEventPayloadSchema,
);
const hitlRequestEventContentSchema = eventContentSchema(
  "hitl_request",
  HitlRequestEventPayloadSchema,
);
const hitlDecisionEventContentSchema = eventContentSchema(
  "hitl_decision",
  HitlDecisionEventPayloadSchema,
);
const runTerminalEventContentSchema = eventContentSchema(
  "run_terminal",
  RunTerminalEventPayloadSchema,
);

export const AgentConversationEventContentSchema = z.discriminatedUnion(
  "eventType",
  [
    userMessageEventContentSchema,
    assistantMessageEventContentSchema,
    systemNoticeEventContentSchema,
    toolActivityEventContentSchema,
    stateSnapshotEventContentSchema,
    hitlRequestEventContentSchema,
    hitlDecisionEventContentSchema,
    runTerminalEventContentSchema,
  ],
);

const conversationEventEnvelopeShape = {
  name: AgentConversationEventNameSchema,
  session: AgentSessionNameSchema,
  execution: AgentExecutionNameSchema.nullable(),
  aguiRunId: AguiRunIdSchema.nullable(),
  sequence: PositiveDecimalSequenceSchema,
  createdAt: z.string().datetime(),
};

export const AgentConversationEventEnvelopeSchema = z
  .discriminatedUnion("eventType", [
    userMessageEventContentSchema.extend(conversationEventEnvelopeShape),
    assistantMessageEventContentSchema.extend(conversationEventEnvelopeShape),
    systemNoticeEventContentSchema.extend(conversationEventEnvelopeShape),
    toolActivityEventContentSchema.extend(conversationEventEnvelopeShape),
    stateSnapshotEventContentSchema.extend(conversationEventEnvelopeShape),
    hitlRequestEventContentSchema.extend(conversationEventEnvelopeShape),
    hitlDecisionEventContentSchema.extend(conversationEventEnvelopeShape),
    runTerminalEventContentSchema.extend(conversationEventEnvelopeShape),
  ])
  .superRefine((value, context) => {
    if (
      !hasMatchingNameParent(() => {
        const event = parseAgentConversationEventName(
          value.name,
          value.session,
        );
        if (event.sequence !== value.sequence) {
          throw new Error(
            "Event name sequence does not match envelope sequence",
          );
        }
      })
    ) {
      addCanonicalNameIssue(
        context,
        ["name"],
        "event name must belong to the session and match the envelope sequence",
      );
    }
    if (
      value.execution !== null &&
      !hasMatchingNameParent(() =>
        parseAgentExecutionName(value.execution, value.session),
      )
    ) {
      addCanonicalNameIssue(
        context,
        ["execution"],
        "execution must belong to the event session",
      );
    }
    if (
      (value.execution === null) !== (value.aguiRunId === null)
    ) {
      addCanonicalNameIssue(
        context,
        ["aguiRunId"],
        "AG-UI run correlation must be present exactly for execution events",
      );
    }
    if (
      value.eventType === "run_terminal" &&
      (value.execution === null || value.aguiRunId === null)
    ) {
      addCanonicalNameIssue(
        context,
        ["aguiRunId"],
        "terminal events require an execution and its AG-UI run correlation",
      );
    }
  });

export const AgentConversationReplaySchema = z
  .object({
    session: AgentSessionNameSchema,
    events: z.array(AgentConversationEventEnvelopeSchema).max(500),
    nextCursor: OpaqueReplayCursorSchema.nullable(),
    lastSequence: NonNegativeDecimalSequenceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    value.events.forEach((event, index) => {
      if (event.session !== value.session) {
        addCanonicalNameIssue(
          context,
          ["events", String(index), "session"],
          "replay event must belong to the replay session",
        );
      }
    });
  });

export const AgentConversationReplayRequestSchema = z
  .object({
    session: AgentSessionNameSchema,
    cursor: OpaqueReplayCursorSchema.nullable().optional(),
  })
  .strict();

export {
  ComparisonResultSchema,
  InteractionRouteKeySchema,
  InteractionUiResultSchema,
  MetricGroupResultSchema,
  NavigationResultSchema,
  NoticeResultSchema,
  ResourceListResultSchema,
  SuggestedRepliesResultSchema,
} from "./ui";
export type {
  ComparisonResult,
  InteractionRouteKey,
  InteractionUiResult,
  MetricGroupResult,
  NavigationResult,
  NoticeResult,
  ResourceListResult,
  SuggestedRepliesResult,
} from "./ui";

const replayMetadataSchema = z
  .object({
    nextCursor: OpaqueReplayCursorSchema.nullable(),
    lastSequence: NonNegativeDecimalSequenceSchema,
  })
  .strict();

export const AguiConnectionAuthorizationSchema = z
  .object({
    session: AgentSessionNameSchema,
    contextEpoch: z.number().int().positive(),
    replay: replayMetadataSchema,
  })
  .strict();

export const AgentConversationConnectionAuthorizationSchema = z
  .object({
    authorization: AguiConnectionAuthorizationSchema,
    replay: AgentConversationReplaySchema,
    liveJoinToken: OpaqueShortLivedTokenSchema.nullable(),
    liveJoinExpiresAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.authorization.session !== value.replay.session) {
      addCanonicalNameIssue(
        context,
        ["replay", "session"],
        "replay must belong to the authorized session",
      );
    }
    if (
      (value.liveJoinToken === null) !==
      (value.liveJoinExpiresAt === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["liveJoinToken"],
        message: "live join token and expiry must be present together",
      });
    }
  });

export type AllowedAgent = z.infer<typeof AllowedAgentSchema>;
export type AgentSessionSummary = z.infer<typeof AgentSessionSummarySchema>;
export type InteractionBootstrap = z.infer<typeof InteractionBootstrapSchema>;
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
export type AgentConversationEventContent = z.infer<
  typeof AgentConversationEventContentSchema
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
export type AgentConversationConnectionAuthorization = z.infer<
  typeof AgentConversationConnectionAuthorizationSchema
>;
