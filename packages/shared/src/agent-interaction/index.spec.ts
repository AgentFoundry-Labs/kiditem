import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AgentDefinitionKeySchema,
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  formatAgentConversationEventName,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  formatOperationRunName,
  formatOrganizationName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  PositiveDecimalSequenceSchema,
} from "../identifiers";
import * as AgentInteraction from "./index";

const readPublicSourceTree = (
  sourceUrl: URL,
  visited = new Set<string>(),
): string => {
  if (visited.has(sourceUrl.href)) {
    return "";
  }
  visited.add(sourceUrl.href);

  const source = readFileSync(sourceUrl, "utf8");
  const reExports = source.matchAll(
    /export(?:\s+type)?\s*\{[\s\S]*?\}\s*from\s*["'](\.[^"']+)["']/g,
  );
  const reExportedSource = Array.from(reExports, (match) =>
    readPublicSourceTree(new URL(`${match[1]}.ts`, sourceUrl), visited),
  );

  return [source, ...reExportedSource].join("\n");
};

const publicAgentInteractionSubpath: string =
  "@kiditem/shared/agent-interaction";
const publicIdentifiersSubpath: string = "@kiditem/shared/identifiers";

const organization = OrganizationIdSchema.parse("legacy-organization-row");
const agentDefinitionKey = AgentDefinitionKeySchema.parse("operator");
const agentVersion = AgentVersionKeySchema.parse("2026.08.13");
const sessionId = AgentSessionIdSchema.parse("legacy-session-row");
const otherSessionId = AgentSessionIdSchema.parse("legacy-other-session-row");
const taskId = AgentSessionTaskIdSchema.parse("legacy-task-row");
const executionId = AgentExecutionIdSchema.parse("legacy-execution-row");
const otherExecutionId = AgentExecutionIdSchema.parse(
  "legacy-other-execution-row",
);
const attemptId = AgentExecutionAttemptIdSchema.parse("legacy-attempt-row");
const operationId = OperationRunIdSchema.parse("legacy-operation-row");
const sequence = (value: string) => PositiveDecimalSequenceSchema.parse(value);

const agentVersionName = formatAgentVersionName(
  agentDefinitionKey,
  agentVersion,
);
const sessionName = formatAgentSessionName(organization, sessionId);
const otherSessionName = formatAgentSessionName(organization, otherSessionId);
const taskName = formatAgentSessionTaskName(organization, sessionId, taskId);
const executionName = formatAgentExecutionName(
  organization,
  sessionId,
  executionId,
);
const otherExecutionName = formatAgentExecutionName(
  organization,
  otherSessionId,
  otherExecutionId,
);
const attemptName = formatAgentExecutionAttemptName(
  organization,
  sessionId,
  executionId,
  attemptId,
);
const operationName = formatOperationRunName(organization, operationId);

const agent = {
  agentDefinitionKey,
  agentVersion: agentVersionName,
  displayName: "KidItem Operator",
  description: "KidItem operations agent",
  isDefault: true,
} as const;

const session = {
  name: sessionName,
  copilotThreadId: "copilot-thread-1",
  primaryAgentDefinitionKey: agentDefinitionKey,
  primaryAgentVersion: agentVersionName,
  lifecycle: "active",
  updatedAt: "2026-08-13T00:00:00.000Z",
} as const;

const dashboardContext = {
  routeKey: "analytics.dashboard",
  resourceRefs: [{ kind: "product", id: "product-1", version: "7" }],
  filters: { status: ["ready"], page: 2, active: true },
  visibleRowIds: ["product-1"],
  aggregateSummary: { total: 1, sampled: true, note: null },
  locale: "ko-KR",
  timezone: "Asia/Seoul",
} as const;

const runAuthorization = {
  session: sessionName,
  task: taskName,
  execution: executionName,
  modelIdentity: "gpt-5",
  runtimeType: "ag_ui",
  policySnapshotId: "policy-snapshot-1",
  contextEpoch: 1,
  dashboardContext,
} as const;

const event = <T extends Record<string, unknown>>(
  sequenceValue: string,
  overrides: T,
) => {
  const canonicalSequence = sequence(sequenceValue);
  return {
    name: formatAgentConversationEventName(
      organization,
      sessionId,
      canonicalSequence,
    ),
    session: sessionName,
    execution: executionName,
    sequence: canonicalSequence,
    createdAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
};

const userMessageEvent = event("1", {
  eventType: "user_message" as const,
  schemaVersion: 1 as const,
  payload: {
    phase: "complete" as const,
    messageId: "message-1",
    content: "재고 현황 알려줘",
  },
});

const replay = {
  session: sessionName,
  events: [userMessageEvent],
  nextCursor: "opaque-replay-cursor",
  lastSequence: sequence("1"),
} as const;

const connectionAuthorization = {
  session: sessionName,
  contextEpoch: 1,
  replay: {
    nextCursor: null,
    lastSequence: sequence("1"),
  },
} as const;

describe("agent interaction contracts", () => {
  it("keeps dashboard context useful while stripping untrusted external authority", () => {
    const context = AgentInteraction.DashboardContextSchema.parse({
      ...dashboardContext,
      organizationId: "attacker-org",
      permissions: ["admin"],
    });

    expect(context).toEqual(dashboardContext);
    expect(context).not.toHaveProperty("organizationId");
    expect(context).not.toHaveProperty("permissions");
  });

  it("re-exports durable runtime schemas with canonical correlation names only", async () => {
    const PublicAgentInteraction = await import(publicAgentInteractionSubpath);
    const PublicIdentifiers = await import(publicIdentifiersSubpath);
    const publicOrganization = PublicIdentifiers.OrganizationIdSchema.parse(
      "durable-organization-row",
    );
    const publicSessionId = PublicIdentifiers.AgentSessionIdSchema.parse(
      "durable-session-row",
    );
    const publicTaskId =
      PublicIdentifiers.AgentSessionTaskIdSchema.parse("durable-task-row");
    const publicChildTaskId = PublicIdentifiers.AgentSessionTaskIdSchema.parse(
      "durable-child-task-row",
    );
    const publicExecutionId = PublicIdentifiers.AgentExecutionIdSchema.parse(
      "durable-execution-row",
    );
    const publicAgentDefinition =
      PublicIdentifiers.AgentDefinitionKeySchema.parse("operator");
    const publicAgentVersion =
      PublicIdentifiers.AgentVersionKeySchema.parse("1");
    const publicTargetDefinition =
      PublicIdentifiers.AgentDefinitionKeySchema.parse("sourcing");
    const publicTargetVersion =
      PublicIdentifiers.AgentVersionKeySchema.parse("2");
    const durableCorrelation = {
      session: PublicIdentifiers.formatAgentSessionName(
        publicOrganization,
        publicSessionId,
      ),
      task: PublicIdentifiers.formatAgentSessionTaskName(
        publicOrganization,
        publicSessionId,
        publicTaskId,
      ),
      execution: PublicIdentifiers.formatAgentExecutionName(
        publicOrganization,
        publicSessionId,
        publicExecutionId,
      ),
    };
    const progress = {
      name: "kiditem.ui.agent_progress.v1",
      ...durableCorrelation,
      status: "running" as const,
      progress: 0.4,
      label: "상품 근거 확인 중",
      updatedAt: "2026-08-14T00:00:00.000Z",
    };

    expect(
      PublicAgentInteraction.AgentProgressEventSchema.parse(progress),
    ).toEqual(progress);
    expect(
      PublicAgentInteraction.AgentApprovalCardSchema.parse({
        name: "kiditem.ui.agent_approval.v1",
        approvalId: "87c00f28-a6a5-4e3a-aef0-f6798d3a3aac",
        ...durableCorrelation,
        capabilityKey: "supply.submit",
        summary: "발주 제출",
        resourceVersions: [],
        expiresAt: "2026-08-14T00:00:00.000Z",
      }),
    ).toMatchObject(durableCorrelation);
    expect(
      PublicAgentInteraction.AgentApprovalDecisionSchema.parse({
        approvalId: "87c00f28-a6a5-4e3a-aef0-f6798d3a3aac",
        ...durableCorrelation,
        decision: "approved",
        idempotencyKey: "durable-approval-1",
      }),
    ).toMatchObject(durableCorrelation);
    expect(
      PublicAgentInteraction.AgentArtifactCardSchema.parse({
        name: "kiditem.ui.agent_artifact.v1",
        artifactId: "df3edfa6-ce18-429b-9ef3-7e6c7fb7f709",
        ...durableCorrelation,
        artifactType: "report",
        label: "소싱 보고서",
        sha256: "a".repeat(64),
        navigationActionId: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-08-14T00:00:00.000Z",
      }),
    ).toMatchObject(durableCorrelation);

    const durableTaskControl = {
      session: durableCorrelation.session,
      task: durableCorrelation.task,
      idempotencyKey: "durable-control-1",
    };
    for (const [schema, expectedStatus] of [
      [PublicAgentInteraction.RetryAgentTaskSchema, "failed"],
      [PublicAgentInteraction.ResumeAgentTaskSchema, "paused"],
      [PublicAgentInteraction.CancelAgentTaskSchema, "running"],
    ] as const) {
      expect(
        schema.parse({ ...durableTaskControl, expectedStatus }),
      ).toMatchObject(durableTaskControl);
    }

    expect(
      PublicAgentInteraction.AgentDelegationEventSchema.parse({
        name: "kiditem.ui.agent_delegation.v1",
        session: durableCorrelation.session,
        parentTask: durableCorrelation.task,
        childTask: PublicIdentifiers.formatAgentSessionTaskName(
          publicOrganization,
          publicSessionId,
          publicChildTaskId,
        ),
        fromAgentVersion: PublicIdentifiers.formatAgentVersionName(
          publicAgentDefinition,
          publicAgentVersion,
        ),
        toAgentVersion: PublicIdentifiers.formatAgentVersionName(
          publicTargetDefinition,
          publicTargetVersion,
        ),
        status: "created",
        createdAt: "2026-08-14T00:00:00.000Z",
      }),
    ).toMatchObject({
      session: durableCorrelation.session,
      parentTask: durableCorrelation.task,
    });

    for (const rawField of [
      { sessionId: "1d3ca687-ea5d-4199-a26c-df90ba387918" },
      { taskId: "a49bc6cb-9b0d-4767-846f-e96eb91a14cf" },
      { executionId: "7b24602d-f206-4dd5-9a11-f5b792ce4363" },
    ]) {
      expect(() =>
        PublicAgentInteraction.AgentProgressEventSchema.parse({
          ...progress,
          ...rawField,
        }),
      ).toThrow();
    }
  });

  it("uses canonical agent and session resource names", () => {
    expect(AgentInteraction.AllowedAgentSchema.parse(agent)).toEqual(agent);
    expect(AgentInteraction.AgentSessionSummarySchema.parse(session)).toEqual(
      session,
    );

    for (const invalidAgent of [
      { ...agent, agentVersion: "version-1" },
      { ...agent, agentVersionId: "legacy-version-row" },
      { ...agent, supportsQuickAsk: true },
    ]) {
      expect(() =>
        AgentInteraction.AllowedAgentSchema.parse(invalidAgent),
      ).toThrow();
    }

    for (const invalidSession of [
      { ...session, name: formatOrganizationName(organization) },
      { ...session, primaryAgentVersion: "version-1" },
      { ...session, lifecycle: "deleted" },
      { ...session, updatedAt: "tomorrow" },
      { ...session, sessionId: "legacy-session-row" },
      { ...session, organizationId: "attacker-org" },
    ]) {
      expect(() =>
        AgentInteraction.AgentSessionSummarySchema.parse(invalidSession),
      ).toThrow();
    }
  });

  it("requires one matching default and unique canonical agent versions in bootstrap", () => {
    const schema = AgentInteraction.InteractionBootstrapSchema;
    const bootstrap = {
      defaultAgentDefinitionKey: agentDefinitionKey,
      agents: [agent],
      sessions: [session],
    };

    expect(schema.parse(bootstrap)).toEqual(bootstrap);

    for (const invalidBootstrap of [
      { ...bootstrap, agents: [{ ...agent, isDefault: false }] },
      {
        ...bootstrap,
        agents: [agent, { ...agent, isDefault: false }],
      },
      { ...bootstrap, defaultAgentDefinitionKey: "analyst" },
      { ...bootstrap, threadTargets: [] },
      {
        ...bootstrap,
        agents: [{ ...agent, agentVersionId: "legacy-version-row" }],
      },
    ]) {
      expect(() => schema.parse(invalidBootstrap)).toThrow();
    }
  });

  it("accepts only the strict opaque run-intent contract", () => {
    const intent = {
      runIntent: "run-intent-token-that-is-at-least-thirty-two-bytes",
      expiresAt: "2026-08-13T00:00:30.000Z",
      copilotThreadId: "copilot-thread-1",
      aguiRunId: "agui-run-1",
    } as const;

    expect(AgentInteraction.AguiRunIntentSchema.parse(intent)).toEqual(intent);

    for (const invalidIntent of [
      { ...intent, runIntent: "too-short" },
      { ...intent, expiresAt: "tomorrow" },
      { ...intent, copilotThreadId: "" },
      { ...intent, archive: null },
      { ...intent, preparationToken: intent.runIntent },
    ]) {
      expect(() =>
        AgentInteraction.AguiRunIntentSchema.parse(invalidIntent),
      ).toThrow();
    }
  });

  it("authorizes a non-null canonical session task and execution only", () => {
    const schema = AgentInteraction.AguiRunAuthorizationSchema;

    expect(schema.parse(runAuthorization)).toEqual(runAuthorization);

    for (const invalidAuthorization of [
      { ...runAuthorization, session: null },
      { ...runAuthorization, task: null },
      { ...runAuthorization, execution: null },
      {
        ...runAuthorization,
        task: formatAgentSessionTaskName(organization, otherSessionId, taskId),
      },
      { ...runAuthorization, execution: otherExecutionName },
      { ...runAuthorization, modelIdentity: "" },
      { ...runAuthorization, runtimeType: "" },
      { ...runAuthorization, policySnapshotId: "" },
      { ...runAuthorization, contextEpoch: 0 },
      { ...runAuthorization, sessionTaskId: "legacy-task-row" },
      { ...runAuthorization, executionId: "legacy-execution-row" },
      { ...runAuthorization, organizationId: "attacker-org" },
    ]) {
      expect(() => schema.parse(invalidAuthorization)).toThrow();
    }
  });

  it("correlates external runs with canonical resource names only", () => {
    const correlation = {
      copilotThreadId: "copilot-thread-1",
      aguiRunId: "agui-run-1",
      session: sessionName,
      task: taskName,
      execution: executionName,
      attempt: attemptName,
      operation: operationName,
    } as const;

    expect(AgentInteraction.AgentCorrelationSchema.parse(correlation)).toEqual(
      correlation,
    );
    expect(
      AgentInteraction.AgentCorrelationSchema.parse({
        ...correlation,
        attempt: null,
        operation: null,
      }),
    ).toEqual({ ...correlation, attempt: null, operation: null });

    for (const invalidCorrelation of [
      {
        ...correlation,
        task: formatAgentSessionTaskName(organization, otherSessionId, taskId),
      },
      { ...correlation, execution: otherExecutionName },
      {
        ...correlation,
        attempt: formatAgentExecutionAttemptName(
          organization,
          otherSessionId,
          otherExecutionId,
          attemptId,
        ),
      },
      {
        ...correlation,
        operation: formatOperationRunName(
          OrganizationIdSchema.parse("other-organization-row"),
          operationId,
        ),
      },
      { ...correlation, sessionId: "legacy-session-row" },
      { ...correlation, executionId: "legacy-execution-row" },
      { ...correlation, attemptId: "legacy-attempt-row" },
      { ...correlation, operationsRunId: "legacy-operation-row" },
    ]) {
      expect(() =>
        AgentInteraction.AgentCorrelationSchema.parse(invalidCorrelation),
      ).toThrow();
    }
  });

  it("validates every version-1 event discriminant with canonical envelope names", () => {
    const summaryHash = "a".repeat(64);
    const eventVariants = [
      userMessageEvent,
      event("2", {
        eventType: "assistant_message" as const,
        schemaVersion: 1 as const,
        payload: {
          phase: "complete" as const,
          messageId: "message-2",
          content: "재고는 10개입니다.",
        },
      }),
      event("3", {
        execution: null,
        eventType: "system_notice" as const,
        schemaVersion: 1 as const,
        payload: { code: "session_resumed", content: "세션이 재개되었습니다." },
      }),
      event("4", {
        eventType: "tool_activity" as const,
        schemaVersion: 1 as const,
        payload: {
          toolCallId: "tool-call-1",
          toolName: "inventory.lookup",
          status: "started" as const,
        },
      }),
      event("5", {
        eventType: "state_snapshot" as const,
        schemaVersion: 1 as const,
        payload: {
          snapshotType: "conversation_summary" as const,
          snapshotVersion: 1,
          data: {
            content: "요약된 대화 상태",
            sourceFromSequence: sequence("1"),
            sourceThroughSequence: sequence("4"),
            sourceHash: summaryHash,
            summarizerModelIdentity: "gpt-5",
            summaryPromptHash: summaryHash,
          },
        },
      }),
      event("6", {
        eventType: "hitl_request" as const,
        schemaVersion: 1 as const,
        payload: {
          requestId: "11111111-1111-4111-8111-111111111111",
          status: "pending" as const,
          prompt: "변경을 승인할까요?",
        },
      }),
      event("7", {
        eventType: "hitl_decision" as const,
        schemaVersion: 1 as const,
        payload: {
          requestId: "11111111-1111-4111-8111-111111111111",
          decision: "approved" as const,
        },
      }),
      event("8", {
        eventType: "run_terminal" as const,
        schemaVersion: 1 as const,
        payload: { status: "completed" as const, errorCode: null },
      }),
    ];

    for (const variant of eventVariants) {
      expect(
        AgentInteraction.AgentConversationEventEnvelopeSchema.parse(variant),
      ).toEqual(variant);
    }
  });

  it("rejects event resource/parent mismatches, invalid schema versions, and raw event fields", () => {
    const schema = AgentInteraction.AgentConversationEventEnvelopeSchema;

    for (const invalidEvent of [
      {
        ...userMessageEvent,
        name: formatAgentConversationEventName(
          organization,
          sessionId,
          sequence("2"),
        ),
      },
      { ...userMessageEvent, session: otherSessionName },
      { ...userMessageEvent, execution: otherExecutionName },
      { ...userMessageEvent, sequence: "0" },
      { ...userMessageEvent, eventType: "unknown_event" },
      { ...userMessageEvent, schemaVersion: 2 },
      {
        ...userMessageEvent,
        payload: { code: "wrong_payload", content: "not a message" },
      },
      { ...userMessageEvent, createdAt: "yesterday" },
      { ...userMessageEvent, aguiRunId: "agui-run-1" },
      { ...userMessageEvent, eventId: "legacy-event-row" },
      { ...userMessageEvent, sessionId: "legacy-session-row" },
      { ...userMessageEvent, executionId: "legacy-execution-row" },
    ]) {
      expect(() => schema.parse(invalidEvent)).toThrow();
    }
  });

  it("validates bounded versioned event content before envelope assignment", () => {
    const schema = AgentInteraction.AgentConversationEventContentSchema;
    const content = {
      eventType: "assistant_message" as const,
      schemaVersion: 1 as const,
      payload: {
        phase: "delta" as const,
        messageId: "message-2",
        content: "재고는 ",
      },
    };

    expect(schema.parse(content)).toEqual(content);
    expect(() =>
      schema.parse({
        ...content,
        payload: { phase: "delta", messageId: "message-2" },
      }),
    ).toThrow();
    expect(() => schema.parse({ ...content, schemaVersion: 2 })).toThrow();
    expect(() =>
      schema.parse({
        ...content,
        payload: { code: "wrong_payload", content: "not a message" },
      }),
    ).toThrow();
  });

  it("keeps explicit message phases and durable tool-result correlation", () => {
    const contentSchema = AgentInteraction.AgentConversationEventContentSchema;

    for (const payload of [
      { phase: "start", messageId: "assistant-1" },
      { phase: "delta", messageId: "assistant-1", content: "첫 " },
      { phase: "end", messageId: "assistant-1" },
    ]) {
      expect(
        contentSchema.parse({
          eventType: "assistant_message",
          schemaVersion: 1,
          payload,
        }).payload,
      ).toEqual(payload);
    }

    const toolResult = contentSchema.parse({
      eventType: "state_snapshot",
      schemaVersion: 1,
      payload: {
        snapshotType: "tool_result",
        snapshotVersion: 1,
        data: {
          messageId: "tool-message-1",
          toolCallId: "tool-call-1",
          result: {
            kind: "notice",
            title: "완료",
            body: "도구 실행이 완료되었습니다.",
            tone: "info",
            textFallback: "도구 실행이 완료되었습니다.",
          },
        },
      },
    });

    expect(toolResult).toMatchObject({
      eventType: "state_snapshot",
      payload: {
        snapshotType: "tool_result",
        data: {
          messageId: "tool-message-1",
          toolCallId: "tool-call-1",
        },
      },
    });
    expect(() =>
      contentSchema.parse({
        eventType: "state_snapshot",
        schemaVersion: 1,
        payload: {
          snapshotType: "tool_result",
          snapshotVersion: 1,
          data: {
            result: {
              kind: "notice",
              title: "완료",
              body: "도구 실행이 완료되었습니다.",
              tone: "info",
              textFallback: "도구 실행이 완료되었습니다.",
            },
          },
        },
      }),
    ).toThrow();
  });

  it("returns replay by canonical session with opaque cursors and decimal sequences", () => {
    const schema = AgentInteraction.AgentConversationReplaySchema;

    expect(schema.parse(replay)).toEqual(replay);
    expect(
      schema.parse({
        session: sessionName,
        events: [],
        nextCursor: null,
        lastSequence: "0",
      }),
    ).toEqual({
      session: sessionName,
      events: [],
      nextCursor: null,
      lastSequence: "0",
    });

    for (const invalidReplay of [
      { ...replay, session: formatOrganizationName(organization) },
      { ...replay, nextCursor: "short" },
      { ...replay, lastSequence: "01" },
      { ...replay, lastSequence: -1 },
      { ...replay, sessionId: "legacy-session-row" },
    ]) {
      expect(() => schema.parse(invalidReplay)).toThrow();
    }
  });

  it("accepts only an opaque replay cursor and rejects decoded sequence input", () => {
    const schema = AgentInteraction.AgentConversationReplayRequestSchema;
    const request = { session: sessionName, cursor: "opaque-replay-cursor" };

    expect(schema.parse(request)).toEqual(request);
    expect(schema.parse({ session: sessionName, cursor: null })).toEqual({
      session: sessionName,
      cursor: null,
    });

    for (const decodedAuthority of [
      { afterSequence: "1" },
      { sequence: "1" },
      { organizationId: "attacker-org" },
      { userId: "attacker-user" },
      { sessionId: "legacy-session-row" },
      { copilotThreadId: "copilot-thread-1" },
    ]) {
      expect(() => schema.parse({ ...request, ...decodedAuthority })).toThrow();
    }
  });

  it("keeps connection authorization read-only and limited to session replay metadata", () => {
    const schema = AgentInteraction.AguiConnectionAuthorizationSchema;

    expect(schema.parse(connectionAuthorization)).toEqual(
      connectionAuthorization,
    );
    expect(
      schema.parse({
        ...connectionAuthorization,
        replay: { nextCursor: "opaque-replay-cursor", lastSequence: "3" },
      }),
    ).toEqual({
      ...connectionAuthorization,
      replay: { nextCursor: "opaque-replay-cursor", lastSequence: "3" },
    });

    for (const invalidAuthorization of [
      { ...connectionAuthorization, contextEpoch: 0 },
      { ...connectionAuthorization, execution: executionName },
      { ...connectionAuthorization, executionId: "legacy-execution-row" },
      { ...connectionAuthorization, currentExecution: { status: "running" } },
      { ...connectionAuthorization, modelIdentity: "gpt-5" },
      { ...connectionAuthorization, policySnapshotId: "policy-snapshot-1" },
      {
        ...connectionAuthorization,
        replay: { ...connectionAuthorization.replay, afterSequence: "1" },
      },
      {
        ...connectionAuthorization,
        replay: {
          ...connectionAuthorization.replay,
          events: [userMessageEvent],
        },
      },
    ]) {
      expect(() => schema.parse(invalidAuthorization)).toThrow();
    }
  });

  it("deletes retired dual-lifecycle exports and raw public fields from production source", () => {
    const productionSource = readPublicSourceTree(
      new URL("./index.ts", import.meta.url),
    );
    const retiredIdentifiers = [
      /\bInteractionClass(?:Schema)?\b/,
      /\bInteractionThreadTarget(?:Schema)?\b/,
      /\bThreadBinding(?:Schema)?\b/,
      /\binteractionClass\b/,
      /\bidleExpiresAt\b/,
      /\bAguiThreadArchiveCommand(?:Schema)?\b/,
      /\bAguiRunPreparation(?:Schema)?\b/,
      /\bpreparationToken\b/,
      /\bsupportsQuickAsk\b/,
      /\bthreadTargets\b/,
      /\bagentVersionId\b/,
      /\bsessionId\b/,
      /\bsessionTaskId\b/,
      /\bexecutionId\b/,
      /\battemptId\b/,
      /\boperationsRunId\b/,
      /\beventId\b/,
      /\btaskId\b/,
      /\bparentTaskId\b/,
      /\bchildTaskId\b/,
    ];

    for (const retiredIdentifier of retiredIdentifiers) {
      expect(productionSource).not.toMatch(retiredIdentifier);
    }

    for (const retiredExport of [
      "InteractionClassSchema",
      "InteractionThreadTargetSchema",
      "ThreadBindingSchema",
      "AguiThreadArchiveCommandSchema",
    ]) {
      expect(AgentInteraction).not.toHaveProperty(retiredExport);
    }
  });
});
