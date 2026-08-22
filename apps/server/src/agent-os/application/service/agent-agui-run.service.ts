import { Inject, Injectable } from "@nestjs/common";
import {
  EventSchemas,
  EventType,
  RunAgentInputSchema,
  type BaseEvent,
} from "@ag-ui/core";
import {
  AguiRunAuthorizationSchema,
  AgentConversationEventContentSchema,
  InteractionUiResultSchema,
  type AgentConversationEventContent,
} from "@kiditem/shared/agent-interaction";
import {
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  OrganizationIdSchema,
  ToolCallIdSchema,
} from "@kiditem/shared/identifiers";
import {
  AGENT_AGUI_RUNNER_PORT,
  type AgentAguiRunnerPort,
  type AuthorizedAguiRunInput,
  type StopAuthorizedAguiRunInput,
} from "../port/in/agent-agui-runner.port";
import {
  AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
  type AgentSessionCapabilityInvocationPort,
} from "../port/in/session-capability/agent-capability-invocation.port";
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePublisherPort,
} from "../port/out/event/agent-conversation-live-publisher.port";
import {
  INTERACTION_PRODUCT_ANALYTICS_PORT,
  type InteractionProductAnalyticsPort,
  type InteractionRendererKind,
} from "../port/out/event/interaction-product-analytics.port";
import type { AgentExecutionRuntimeContext } from "../port/out/repository/interaction/agent-interaction.persistence.types";
import {
  AGENT_EXECUTION_QUERY_REPOSITORY,
  type AgentExecutionQueryRepositoryPort,
} from "../port/out/repository/interaction/agent-execution-query.repository.port";
import {
  AGENT_CONVERSATION_QUERY_REPOSITORY,
  type AgentConversationQueryRepositoryPort,
} from "../port/out/repository/interaction/agent-conversation-query.repository.port";
import {
  AGENT_CONVERSATION_EVENT_TRANSACTION,
  type AgentConversationEventTransactionPort,
} from "../port/out/transaction/interaction/agent-conversation-event.transaction.port";
import {
  AGENT_EXECUTION_USAGE_TRANSACTION,
  type AgentExecutionUsageTransactionPort,
} from "../port/out/transaction/interaction/agent-execution-usage.transaction.port";
import {
  AgentOsBoundaryError,
  AgentOsError,
} from "../../domain/agent-os.errors";
import { AgentAguiRuntimeRegistry } from "./agent-agui-runtime-registry.service";
import { AgentInteractionPresentationService } from "./agent-interaction-presentation.service";
import type { AgentAguiRuntimeMessage } from "../port/out/runtime/agent-agui-runtime.port";

const MODEL_CONTEXT_EVENT_LIMIT = 200;

@Injectable()
export class AgentAguiRunService implements AgentAguiRunnerPort {
  constructor(
    @Inject(AGENT_EXECUTION_QUERY_REPOSITORY)
    private readonly executions: AgentExecutionQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_QUERY_REPOSITORY)
    private readonly conversations: AgentConversationQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_EVENT_TRANSACTION)
    private readonly events: AgentConversationEventTransactionPort,
    @Inject(AGENT_EXECUTION_USAGE_TRANSACTION)
    private readonly usage: AgentExecutionUsageTransactionPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher: AgentConversationLivePublisherPort,
    private readonly runtimes: AgentAguiRuntimeRegistry,
    @Inject(AGENT_SESSION_CAPABILITY_INVOCATION_PORT)
    private readonly capabilityInvocations: AgentSessionCapabilityInvocationPort,
    private readonly presentation: AgentInteractionPresentationService = new AgentInteractionPresentationService(),
    @Inject(INTERACTION_PRODUCT_ANALYTICS_PORT)
    private readonly analytics: InteractionProductAnalyticsPort = {
      record: async () => false,
    },
  ) {}

  async *run(request: AuthorizedAguiRunInput): AsyncIterable<BaseEvent> {
    const input = RunAgentInputSchema.parse(request.input);
    const forwarded = record(input.forwardedProps);
    const authorization = parseAuthorization(forwarded.kiditemAuthorization);
    if (input.tools.length > 0) {
      throw boundary(
        "INTERACTION_BROWSER_AUTHORITY_REJECTED",
        "Browser-supplied tools cannot grant Agent OS authority.",
      );
    }
    const authorizedExecution = parseAgentExecutionName(
      authorization.execution,
      authorization.session,
    );
    const runtimeContext = await this.executions.loadExecutionRuntimeContext({
      executionId: authorizedExecution.execution,
    });
    if (!runtimeContext) {
      throw boundary(
        "INTERACTION_AUTHORIZATION_MISMATCH",
        "The authorized execution cannot be resolved.",
      );
    }
    const currentExecution = await this.executions.findCurrentExecution({
      executionId: runtimeContext.executionId,
    });
    if (!currentExecution || currentExecution.status !== "running") {
      throw boundary(
        "INTERACTION_EXECUTION_NOT_RUNNING",
        "The authorized execution is no longer current and running.",
      );
    }
    assertCorrelation(
      request.agentDefinitionKey,
      input,
      authorization,
      runtimeContext,
    );
    const messages = await this.loadCanonicalMessages(input, runtimeContext);
    const runtime = this.runtimes.resolve(runtimeContext.runtimeType);
    if (!runtime) {
      throw boundary(
        "INTERACTION_RUNTIME_NOT_CONFIGURED",
        "The selected AG-UI runtime is not registered.",
      );
    }

    const state = new RuntimeEventState(runtimeContext);
    const startedAt = Date.now();
    const rendererKinds = new Set<InteractionRendererKind>();
    try {
      const stream = runtime.run({
        organizationId: runtimeContext.organizationId,
        userId: runtimeContext.userId,
        sessionId: runtimeContext.sessionId,
        sessionTaskId: runtimeContext.sessionTaskId,
        executionId: runtimeContext.executionId,
        attemptId: runtimeContext.attemptId,
        startIntentId: runtimeContext.startIntentId,
        runtimeCredentialGeneration: runtimeContext.runtimeCredentialGeneration,
        copilotThreadId: runtimeContext.copilotThreadId,
        aguiRunId: runtimeContext.aguiRunId,
        agentDefinitionKey: runtimeContext.agentDefinitionKey,
        runtimeType: runtimeContext.runtimeType,
        modelIdentity: runtimeContext.modelIdentity,
        capabilityKeys: [...runtimeContext.capabilityKeys],
        messages,
        dashboardContext: authorization.dashboardContext,
        invokeCapability: (key, capabilityInput) =>
          this.invokeCapability(runtimeContext, key, capabilityInput),
        recordUsage: (usage) => {
          if (
            !usage.provider.trim() ||
            !Number.isInteger(usage.inputTokens) ||
            usage.inputTokens < 0 ||
            !Number.isInteger(usage.outputTokens) ||
            usage.outputTokens < 0 ||
            usage.costMicros < 0n
          ) {
            throw boundary(
              "INTERACTION_USAGE_INVALID",
              "The runtime usage record is invalid.",
            );
          }
          return this.usage.recordExecutionUsage({
            organizationId: runtimeContext.organizationId,
            sessionId: runtimeContext.sessionId,
            executionId: runtimeContext.executionId,
            modelIdentity: runtimeContext.modelIdentity,
            provider: usage.provider,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costMicros: usage.costMicros,
            currency: "USD",
          });
        },
      });
      for await (const unsafeEvent of stream) {
        const event = parseRuntimeEvent(unsafeEvent);
        const content = state.accept(event);
        const saved = await this.events.appendExecutionEvent({
          organizationId: runtimeContext.organizationId,
          sessionId: runtimeContext.sessionId,
          executionId: runtimeContext.executionId,
          externalEventId: state.externalEventId(event),
          ...content,
          ...(content.eventType === "run_terminal"
            ? {
                terminal: {
                  status: content.payload.status,
                  errorCode: content.payload.errorCode,
                  finishedAt: new Date(),
                },
              }
            : {}),
        });
        if (
          content.eventType === "state_snapshot" &&
          content.payload.snapshotType === "tool_result" &&
          "result" in content.payload.data
        ) {
          rendererKinds.add(content.payload.data.result.kind);
        }
        await this.publishAfterCommit(saved).catch(() => undefined);
        if (content.eventType === "run_terminal") {
          await this.recordAnalytics(
            runtimeContext,
            authorization.dashboardContext,
            startedAt,
            content.payload.status,
            rendererKinds,
          );
        }
        yield event;
      }
      state.assertComplete();
    } catch (error) {
      if (state.terminal) throw error;
      const code = stableErrorCode(error);
      const event: BaseEvent = {
        type: EventType.RUN_ERROR,
        code: code.toUpperCase(),
        message: "The Agent OS runtime failed.",
      };
      const saved = await this.events.appendExecutionEvent({
        organizationId: runtimeContext.organizationId,
        sessionId: runtimeContext.sessionId,
        executionId: runtimeContext.executionId,
        externalEventId: `${runtimeContext.executionId}:agui:error`,
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: "failed", errorCode: code },
        terminal: { status: "failed", errorCode: code, finishedAt: new Date() },
      });
      await this.publishAfterCommit(saved).catch(() => undefined);
      await this.recordAnalytics(
        runtimeContext,
        authorization.dashboardContext,
        startedAt,
        "failed",
        rendererKinds,
      );
      yield event;
    }
  }

  async stop(input: StopAuthorizedAguiRunInput): Promise<boolean> {
    const current = await this.executions.findCurrentSessionExecution({
      sessionId: input.sessionId,
      copilotThreadId: input.copilotThreadId,
    });
    if (
      !current ||
      current.status !== "running" ||
      current.agentDefinitionKey !== input.agentDefinitionKey ||
      current.sessionId !== input.sessionId ||
      current.executionId !== input.executionId ||
      current.copilotThreadId !== input.copilotThreadId ||
      current.aguiRunId !== input.aguiRunId
    ) {
      return false;
    }
    const runtime = this.runtimes.resolve(current.runtimeType);
    if (!runtime?.stop) return false;
    return runtime.stop({
      organizationId: current.organizationId,
      sessionId: current.sessionId,
      executionId: current.executionId,
      copilotThreadId: current.copilotThreadId,
      aguiRunId: current.aguiRunId,
    });
  }

  private async loadCanonicalMessages(
    input: ReturnType<typeof RunAgentInputSchema.parse>,
    context: AgentExecutionRuntimeContext,
  ): Promise<AgentAguiRuntimeMessage[]> {
    const submitted = input.messages.at(-1);
    const initial = context.initialUserEvent;
    const initialPayload = messageContent(initial);
    if (
      !submitted ||
      submitted.role !== "user" ||
      typeof submitted.content !== "string" ||
      submitted.id !== initial.externalEventId ||
      initial.eventType !== "user_message" ||
      initialPayload.messageId !== submitted.id ||
      messageText(initialPayload) !== submitted.content
    ) {
      throw boundary(
        "INTERACTION_INITIAL_USER_EVENT_MISMATCH",
        "The submitted user event does not match the persisted signed event.",
      );
    }
    const page = await this.conversations.readModelConversation({
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      throughSequence: initial.sequence,
      limit: MODEL_CONTEXT_EVENT_LIMIT,
    });
    if (page.hasMore) {
      throw boundary(
        "INTERACTION_CONTEXT_LIMIT_EXCEEDED",
        "The canonical conversation exceeds the active context bound.",
      );
    }
    const messages: AgentAguiRuntimeMessage[] = [];
    let openAssistant: { id: string; content: string } | null = null;
    for (const event of page.events) {
      if (
        event.eventType === "user_message" ||
        event.eventType === "assistant_message"
      ) {
        const payload = messageContent(event);
        const phase = messagePhase(payload);
        if (event.eventType === "user_message") {
          if (
            openAssistant ||
            phase === "start" ||
            phase === "delta" ||
            phase === "end"
          ) {
            throw boundary(
              "INTERACTION_MESSAGE_STREAM_INVALID",
              "Canonical message streams are interleaved.",
            );
          }
          messages.push({
            id: payload.messageId,
            role: "user",
            content: messageText(payload),
          });
          continue;
        }
        if (phase === "complete") {
          if (openAssistant)
            throw boundary(
              "INTERACTION_MESSAGE_STREAM_INVALID",
              "Canonical message streams are interleaved.",
            );
          messages.push({
            id: payload.messageId,
            role: "assistant",
            content: messageText(payload),
          });
          continue;
        }
        if (phase === "start") {
          if (openAssistant)
            throw boundary(
              "INTERACTION_MESSAGE_STREAM_INVALID",
              "Canonical message streams are interleaved.",
            );
          openAssistant = { id: payload.messageId, content: "" };
          continue;
        }
        if (!openAssistant || openAssistant.id !== payload.messageId) {
          throw boundary(
            "INTERACTION_MESSAGE_STREAM_INVALID",
            "Canonical message stream ordering is invalid.",
          );
        }
        if (phase === "delta") {
          openAssistant.content += messageText(payload);
          continue;
        }
        if (!openAssistant.content) {
          throw boundary(
            "INTERACTION_MESSAGE_STREAM_INVALID",
            "Canonical assistant messages cannot be empty.",
          );
        }
        messages.push({
          id: openAssistant.id,
          role: "assistant",
          content: openAssistant.content,
        });
        openAssistant = null;
        continue;
      }
      if (event.eventType === "state_snapshot") {
        const content = AgentConversationEventContentSchema.parse({
          eventType: event.eventType,
          schemaVersion: event.schemaVersion,
          payload: event.payload,
        });
        if (
          content.eventType !== "state_snapshot" ||
          content.payload.snapshotType === "tool_result" ||
          !("content" in content.payload.data)
        )
          continue;
        if (openAssistant)
          throw boundary(
            "INTERACTION_MESSAGE_STREAM_INVALID",
            "Canonical message streams are interleaved.",
          );
        messages.push({
          id: event.externalEventId,
          role: "tool",
          content: content.payload.data.content,
        });
      }
    }
    if (openAssistant) {
      throw boundary(
        "INTERACTION_MESSAGE_STREAM_INVALID",
        "Canonical assistant message stream is incomplete.",
      );
    }
    return messages;
  }

  private async invokeCapability(
    context: AgentExecutionRuntimeContext,
    key: string,
    unsafeInput: Record<string, unknown>,
  ) {
    if (!context.capabilityKeys.includes(key)) {
      throw boundary(
        "INTERACTION_CAPABILITY_NOT_ALLOWED",
        "The capability is absent from the immutable policy snapshot.",
      );
    }
    const organizationId = OrganizationIdSchema.parse(context.organizationId);
    const sessionId = AgentSessionIdSchema.parse(context.sessionId);
    const sessionTaskId = AgentSessionTaskIdSchema.parse(context.sessionTaskId);
    const executionId = AgentExecutionIdSchema.parse(context.executionId);
    let result;
    try {
      result = await this.capabilityInvocations.invoke({
        session: formatAgentSessionName(organizationId, sessionId),
        task: formatAgentSessionTaskName(
          organizationId,
          sessionId,
          sessionTaskId,
        ),
        execution: formatAgentExecutionName(
          organizationId,
          sessionId,
          executionId,
        ),
        capabilityKey: key,
        input: unsafeInput,
      });
    } catch (error) {
      if (
        error instanceof AgentOsError ||
        error instanceof AgentOsBoundaryError
      ) {
        throw boundary(
          "INTERACTION_CAPABILITY_NOT_ALLOWED",
          "The official Agent session capability invocation was denied.",
        );
      }
      throw error;
    }
    return {
      ...result,
      interactionUiResult: this.presentation.projectCapabilityResult(
        {
          organizationId: context.organizationId,
          userId: context.userId,
          sessionId: context.sessionId,
        },
        key,
        result,
      ),
    };
  }

  private async publishAfterCommit(saved: {
    id: string;
    organizationId: string;
    sessionId: string;
    sequence: bigint;
  }): Promise<void> {
    await this.publisher.publish({
      organizationId: saved.organizationId,
      sessionId: saved.sessionId,
      eventId: saved.id,
      sequence: saved.sequence,
    });
  }

  private async recordAnalytics(
    context: AgentExecutionRuntimeContext,
    dashboardContext: unknown,
    startedAt: number,
    outcome: "completed" | "failed" | "cancelled",
    rendererKinds: Set<InteractionRendererKind>,
  ): Promise<void> {
    const surface =
      record(dashboardContext).routeKey === "agent_os"
        ? "agent_os_workspace"
        : "global_panel";
    await this.analytics
      .record({
        event: "interaction_run_finished",
        organizationId: context.organizationId,
        sessionId: context.sessionId,
        executionId: context.executionId,
        agentDefinitionKey: context.agentDefinitionKey,
        surface,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome,
        rendererKinds: [...rendererKinds],
      })
      .catch(() => false);
  }
}

class RuntimeEventState {
  private ordinal = 0;
  private started = false;
  terminal = false;
  private readonly openMessages = new Set<string>();
  private readonly tools = new Map<
    string,
    "open" | "endedAwaitingResult" | "consumed"
  >();

  constructor(private readonly context: AgentExecutionRuntimeContext) {}

  accept(event: ParsedAguiEvent): AgentConversationEventContent {
    if (this.terminal)
      throw invalidEvent("Events cannot follow a terminal event.");
    this.ordinal += 1;
    switch (event.type) {
      case EventType.RUN_STARTED:
        if (
          this.started ||
          event.threadId !== this.context.copilotThreadId ||
          event.runId !== this.context.aguiRunId
        ) {
          throw invalidEvent("RUN_STARTED correlation is invalid.");
        }
        this.started = true;
        return notice("agui.run_started", "Agent run started.");
      case EventType.TEXT_MESSAGE_START:
        this.requireStarted();
        if (
          event.role !== "assistant" ||
          this.openMessages.has(event.messageId)
        )
          throw invalidEvent("Assistant message start is invalid.");
        this.openMessages.add(event.messageId);
        return {
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: { phase: "start", messageId: event.messageId },
        };
      case EventType.TEXT_MESSAGE_CONTENT:
        this.requireStarted();
        if (!this.openMessages.has(event.messageId) || event.delta.length === 0)
          throw invalidEvent("Assistant message content is out of order.");
        return {
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: {
            phase: "delta",
            messageId: event.messageId,
            content: event.delta,
          },
        };
      case EventType.TEXT_MESSAGE_END:
        this.requireStarted();
        if (!this.openMessages.delete(event.messageId))
          throw invalidEvent("Assistant message end is out of order.");
        return {
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: { phase: "end", messageId: event.messageId },
        };
      case EventType.TOOL_CALL_START:
        this.requireStarted();
        if (this.tools.has(event.toolCallId))
          throw invalidEvent("Tool call is duplicated.");
        this.tools.set(event.toolCallId, "open");
        return tool(event.toolCallId, event.toolCallName, "started");
      case EventType.TOOL_CALL_ARGS:
        this.requireStarted();
        if (this.tools.get(event.toolCallId) !== "open")
          throw invalidEvent("Tool arguments are out of order.");
        return notice("agui.tool_args_received", "Tool arguments received.");
      case EventType.TOOL_CALL_END:
        this.requireStarted();
        if (this.tools.get(event.toolCallId) !== "open")
          throw invalidEvent("Tool call end is out of order.");
        this.tools.set(event.toolCallId, "endedAwaitingResult");
        return tool(event.toolCallId, "agent_capability", "completed");
      case EventType.TOOL_CALL_RESULT:
        this.requireStarted();
        if (
          event.role !== "tool" ||
          this.tools.get(event.toolCallId) !== "endedAwaitingResult"
        )
          throw invalidEvent("Tool result is out of order or mismatched.");
        this.tools.set(event.toolCallId, "consumed");
        return {
          eventType: "state_snapshot",
          schemaVersion: 1,
          payload: {
            snapshotType: "tool_result",
            snapshotVersion: 1,
            data: {
              messageId: event.messageId,
              toolCallId: ToolCallIdSchema.parse(event.toolCallId),
              result: InteractionUiResultSchema.parse(
                JSON.parse(event.content),
              ),
            },
          },
        };
      case EventType.RUN_FINISHED:
        this.assertTerminalCorrelation(event.threadId, event.runId);
        this.terminal = true;
        return {
          eventType: "run_terminal",
          schemaVersion: 1,
          payload: { status: "completed", errorCode: null },
        };
      case EventType.RUN_ERROR:
        this.requireStarted();
        this.terminal = true;
        return {
          eventType: "run_terminal",
          schemaVersion: 1,
          payload: {
            status: "failed",
            errorCode: stableCode(event.code ?? "runtime_error"),
          },
        };
      default:
        throw invalidEvent("The runtime emitted an unsupported AG-UI event.");
    }
  }

  externalEventId(event: ParsedAguiEvent): string {
    return `${this.context.executionId}:agui:${this.ordinal}:${event.type}`;
  }

  assertComplete(): void {
    if (!this.terminal)
      throw invalidEvent("The runtime ended without a terminal event.");
  }

  private requireStarted(): void {
    if (!this.started) throw invalidEvent("RUN_STARTED must be first.");
  }

  private assertTerminalCorrelation(threadId: string, runId: string): void {
    this.requireStarted();
    if (
      threadId !== this.context.copilotThreadId ||
      runId !== this.context.aguiRunId ||
      this.openMessages.size > 0 ||
      [...this.tools.values()].some((state) => state !== "consumed")
    ) {
      throw invalidEvent("The terminal event is out of order or mismatched.");
    }
  }
}

function assertCorrelation(
  routeAgentDefinitionKey: string,
  input: ReturnType<typeof RunAgentInputSchema.parse>,
  authorization: ReturnType<typeof AguiRunAuthorizationSchema.parse>,
  context: AgentExecutionRuntimeContext,
): void {
  let session;
  let task;
  let execution;
  try {
    session = parseAgentSessionName(authorization.session);
    task = parseAgentSessionTaskName(authorization.task, authorization.session);
    execution = parseAgentExecutionName(
      authorization.execution,
      authorization.session,
    );
  } catch {
    throw boundary(
      "INTERACTION_AUTHORIZATION_MISMATCH",
      "The AG-UI authorization does not contain a canonical control graph.",
    );
  }
  if (
    routeAgentDefinitionKey !== context.agentDefinitionKey ||
    session.organization !== context.organizationId ||
    session.session !== context.sessionId ||
    task.task !== context.sessionTaskId ||
    execution.execution !== context.executionId ||
    authorization.runtimeType !== context.runtimeType ||
    authorization.modelIdentity !== context.modelIdentity ||
    authorization.policyHash !== context.policyHash ||
    authorization.contextEpoch !== context.contextEpoch ||
    input.threadId !== context.copilotThreadId ||
    input.runId !== context.aguiRunId
  ) {
    throw boundary(
      "INTERACTION_AUTHORIZATION_MISMATCH",
      "The AG-UI request does not match canonical execution authority.",
    );
  }
}

type ParsedAguiEvent = ReturnType<typeof EventSchemas.parse>;

function parseRuntimeEvent(value: unknown): ParsedAguiEvent {
  const event = EventSchemas.parse(value);
  if (
    event.rawEvent !== undefined ||
    event.type === EventType.RAW ||
    event.type === EventType.CUSTOM
  ) {
    throw invalidEvent("Provider-specific runtime events are not accepted.");
  }
  const allowed = officialEventKeys(event.type);
  if (Object.keys(event).some((key) => !allowed.has(key))) {
    throw invalidEvent(
      "Provider-specific runtime event fields are not accepted.",
    );
  }
  return event;
}

function officialEventKeys(type: EventType): ReadonlySet<string> {
  const common = ["type", "timestamp"];
  const keys: Partial<Record<EventType, string[]>> = {
    [EventType.RUN_STARTED]: ["threadId", "runId", "parentRunId", "input"],
    [EventType.TEXT_MESSAGE_START]: ["messageId", "role", "name"],
    [EventType.TEXT_MESSAGE_CONTENT]: ["messageId", "delta"],
    [EventType.TEXT_MESSAGE_END]: ["messageId"],
    [EventType.TOOL_CALL_START]: [
      "toolCallId",
      "toolCallName",
      "parentMessageId",
    ],
    [EventType.TOOL_CALL_ARGS]: ["toolCallId", "delta"],
    [EventType.TOOL_CALL_END]: ["toolCallId"],
    [EventType.TOOL_CALL_RESULT]: [
      "messageId",
      "toolCallId",
      "content",
      "role",
    ],
    [EventType.RUN_FINISHED]: ["threadId", "runId", "result", "outcome"],
    [EventType.RUN_ERROR]: ["message", "code"],
  };
  return new Set([...common, ...(keys[type] ?? [])]);
}

function messageContent(event: {
  eventType: string;
  schemaVersion: number;
  payload: unknown;
}) {
  const content = AgentConversationEventContentSchema.parse({
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
  });
  if (
    content.eventType !== "user_message" &&
    content.eventType !== "assistant_message"
  ) {
    throw invalidEvent("Expected a canonical message event.");
  }
  return content.payload;
}

function messagePhase(
  payload: ReturnType<typeof messageContent>,
): "complete" | "start" | "delta" | "end" {
  return "phase" in payload ? payload.phase : "complete";
}

function messageText(payload: ReturnType<typeof messageContent>): string {
  if (!("content" in payload)) {
    throw invalidEvent("Expected canonical message content.");
  }
  return payload.content;
}

function notice(code: string, content: string): AgentConversationEventContent {
  return {
    eventType: "system_notice",
    schemaVersion: 1,
    payload: { code, content },
  };
}

function tool(
  toolCallId: string,
  toolName: string,
  status: "started" | "completed",
): AgentConversationEventContent {
  return {
    eventType: "tool_activity",
    schemaVersion: 1,
    payload: {
      toolCallId: ToolCallIdSchema.parse(toolCallId),
      toolName,
      status,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return value as Record<string, unknown>;
}

function parseAuthorization(
  value: unknown,
): ReturnType<typeof AguiRunAuthorizationSchema.parse> {
  try {
    return AguiRunAuthorizationSchema.parse(value);
  } catch {
    throw boundary(
      "INTERACTION_AUTHORIZATION_MISMATCH",
      "The AG-UI authorization does not contain a valid canonical control graph.",
    );
  }
}

function stableErrorCode(error: unknown): string {
  return stableCode(
    error instanceof AgentOsError
      ? error.code
      : "INTERACTION_RUNTIME_EVENT_INVALID",
  );
}

function stableCode(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return /^[a-z]/.test(normalized)
    ? normalized.slice(0, 128)
    : `runtime_${normalized}`.slice(0, 128);
}

function invalidEvent(message: string): AgentOsBoundaryError {
  return boundary("INTERACTION_RUNTIME_EVENT_INVALID", message);
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}

export const AGENT_AGUI_RUN_SERVICE_PROVIDER = {
  provide: AGENT_AGUI_RUNNER_PORT,
  useExisting: AgentAguiRunService,
};
