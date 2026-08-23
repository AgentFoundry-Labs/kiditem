import { EventType, type BaseEvent } from "@ag-ui/core";
import { z } from "zod";
import {
  AgentConversationEventContentSchema,
  AgentConversationReplaySchema,
  type AgentConversationReplay,
} from "@kiditem/shared/agent-interaction";
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  NonNegativeDecimalSequenceSchema,
  OrganizationIdSchema,
  PositiveDecimalSequenceSchema,
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
} from "@kiditem/shared/identifiers";
import type {
  AgentConversationEventRecord,
  AgentSessionRecord,
  ConversationEventPage,
} from "../../out/repository/interaction/agent-interaction.persistence.types";

/** Transport-facing projection of canonical durable interaction records. */
export class InteractionReplayProjector {
  project(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    session: Pick<AgentSessionRecord, "id">,
    page: ConversationEventPage,
    nextCursor: string | null,
  ): AgentConversationReplay {
    const sessionId = AgentSessionIdSchema.parse(session.id);
    return parseShared(AgentConversationReplaySchema, {
      session: formatAgentSessionName(organizationId, sessionId),
      events: page.events.map((event) => this.envelope(organizationId, sessionId, event)),
      nextCursor: nextCursor === null ? null : NonNegativeDecimalSequenceSchema.parse(nextCursor),
      lastSequence: NonNegativeDecimalSequenceSchema.parse(page.lastSequence.toString()),
    });
  }

  private envelope(
    organizationId: z.infer<typeof OrganizationIdSchema>,
    sessionId: z.infer<typeof AgentSessionIdSchema>,
    event: AgentConversationEventRecord,
  ) {
    return {
      name: formatAgentConversationEventName(organizationId, sessionId, PositiveDecimalSequenceSchema.parse(event.sequence.toString())),
      session: formatAgentSessionName(organizationId, sessionId),
      execution: event.executionId === null ? null : formatAgentExecutionName(organizationId, sessionId, AgentExecutionIdSchema.parse(event.executionId)),
      aguiRunId: event.aguiRunId,
      sequence: PositiveDecimalSequenceSchema.parse(event.sequence.toString()),
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export function projectReplayEvent(event: AgentConversationEventRecord, threadId: string): BaseEvent {
  switch (event.eventType) {
    case "state_snapshot": {
      const content = canonicalContent(event);
      if (content.eventType === "state_snapshot" && (content.payload.snapshotType === "agent_progress" || content.payload.snapshotType === "agent_artifact" || content.payload.snapshotType === "agent_delegation")) {
        const activity = content.payload.data;
        if (!("name" in activity)) return genericStateSnapshot(event);
        return { type: EventType.ACTIVITY_SNAPSHOT, messageId: replayEventMessageId(event), activityType: activity.name, content: activity, replace: true };
      }
      return genericStateSnapshot(event);
    }
    case "user_message":
    case "assistant_message": {
      const content = canonicalContent(event);
      if (content.eventType !== "user_message" && content.eventType !== "assistant_message") throw new Error("Invalid canonical message event.");
      const phase = "phase" in content.payload ? content.payload.phase : "complete";
      if (phase === "start") return { type: EventType.TEXT_MESSAGE_START, messageId: content.payload.messageId, role: event.eventType === "user_message" ? "user" : "assistant" };
      if (phase === "delta") {
        if (!("content" in content.payload)) throw new Error("Invalid canonical message delta.");
        return { type: EventType.TEXT_MESSAGE_CONTENT, messageId: content.payload.messageId, delta: content.payload.content };
      }
      if (phase === "end") return { type: EventType.TEXT_MESSAGE_END, messageId: content.payload.messageId };
      if (!("content" in content.payload)) throw new Error("Invalid canonical complete message.");
      return { type: EventType.TEXT_MESSAGE_CONTENT, messageId: content.payload.messageId, delta: content.payload.content };
    }
    case "run_terminal": {
      const content = canonicalContent(event);
      if (content.eventType !== "run_terminal" || !event.aguiRunId) throw new Error("Canonical terminal event has no AG-UI run correlation.");
      return content.payload.status === "completed"
        ? { type: EventType.RUN_FINISHED, threadId, runId: event.aguiRunId }
        : ({ type: EventType.RUN_ERROR, code: content.payload.errorCode ?? "INTERACTION_RUNTIME_FAILED", message: "The Agent OS runtime failed.", threadId, runId: event.aguiRunId } as BaseEvent);
    }
    default:
      return genericStateSnapshot(event);
  }
}

export function projectReplayStream(events: readonly AgentConversationEventRecord[], threadId: string): BaseEvent[] {
  const projector = new InteractionReplayStreamProjector(threadId);
  projector.prime(events);
  return events.flatMap((event) => projector.project(event));
}

/** Stateful canonical-to-AG-UI projector shared by paged replay and live join. */
export class InteractionReplayStreamProjector {
  private openRunId: string | null = null;
  private readonly resolvedInterrupts = new Set<string>();
  private readonly deferredInterrupts: AgentConversationEventRecord[] = [];
  private closed = false;
  private terminal = false;

  constructor(private readonly threadId: string) {}

  get isClosed(): boolean {
    return this.closed;
  }

  get shouldCloseAfterReplay(): boolean {
    return this.closed || this.terminal;
  }

  /** Learn persisted resolutions before replaying an ordered page. */
  prime(events: readonly AgentConversationEventRecord[]): void {
    for (const event of events) {
      if (event.eventType !== "hitl_decision") continue;
      const content = canonicalContent(event);
      if (content.eventType === "hitl_decision") this.resolvedInterrupts.add(content.payload.requestId);
    }
  }

  project(event: AgentConversationEventRecord, options: { deferInterrupt?: boolean } = {}): BaseEvent[] {
    if (this.closed) return [];
    if (event.eventType === "hitl_request") {
      const content = canonicalContent(event);
      if (content.eventType === "hitl_request" && this.resolvedInterrupts.has(content.payload.requestId)) return [];
    }
    if (event.eventType === "hitl_decision") {
      const content = canonicalContent(event);
      if (content.eventType === "hitl_decision") this.resolvedInterrupts.add(content.payload.requestId);
      this.terminal = false;
      return [projectReplayEvent(event, this.threadId)];
    }
    if (event.eventType === "hitl_request" && options.deferInterrupt) {
      this.deferredInterrupts.push(event);
      this.terminal = false;
      return [];
    }
    const projected: BaseEvent[] = [];
    if (event.aguiRunId && this.openRunId && this.openRunId !== event.aguiRunId) {
      // CopilotKit permits one active run per thread. Delegated durable work
      // has its own AG-UI run id, so close the historical parent projection
      // before exposing the child's snapshots.
      projected.push({ type: EventType.RUN_FINISHED, threadId: this.threadId, runId: this.openRunId });
      this.openRunId = null;
      this.terminal = true;
    }
    if (event.aguiRunId && this.openRunId === null) {
      projected.push({ type: EventType.RUN_STARTED, threadId: this.threadId, runId: event.aguiRunId });
      this.openRunId = event.aguiRunId;
      this.terminal = false;
    }
    projected.push(...projectReplayFragments(event, this.threadId, this.openRunId));
    if (event.eventType === "run_terminal") {
      this.openRunId = null;
      this.terminal = true;
    }
    if (event.eventType === "hitl_request") {
      this.openRunId = null;
      this.closed = true;
    }
    return projected;
  }

  /** Finalize paged durable replay only after every page has supplied decisions. */
  finishReplay(): BaseEvent[] {
    const projected: BaseEvent[] = [];
    for (const event of this.deferredInterrupts) {
      const content = canonicalContent(event);
      if (content.eventType !== "hitl_request" || this.resolvedInterrupts.has(content.payload.requestId)) continue;
      if (event.aguiRunId && this.openRunId && this.openRunId !== event.aguiRunId) {
        projected.push({ type: EventType.RUN_FINISHED, threadId: this.threadId, runId: this.openRunId });
        this.openRunId = null;
      }
      if (event.aguiRunId && this.openRunId !== event.aguiRunId) {
        projected.push({ type: EventType.RUN_STARTED, threadId: this.threadId, runId: event.aguiRunId });
      }
      projected.push(...projectReplayFragments(event, this.threadId, event.aguiRunId));
      this.closed = true;
    }
    this.deferredInterrupts.length = 0;
    return projected;
  }
}

function projectReplayFragments(event: AgentConversationEventRecord, threadId: string, activeRunId: string | null = null): BaseEvent[] {
  if (event.eventType === "hitl_request") {
    const content = canonicalContent(event);
    if (content.eventType !== "hitl_request" || !event.aguiRunId || !content.payload.approval) throw new Error("Canonical approval interrupt has no AG-UI run correlation.");
    const approval = content.payload.approval;
    return [{ type: EventType.RUN_FINISHED, threadId, runId: activeRunId ?? event.aguiRunId, outcome: { type: "interrupt", interrupts: [{ id: content.payload.requestId, reason: "approval_required", message: content.payload.prompt, expiresAt: approval.expiresAt, metadata: { approval } }] } }];
  }
  if (event.eventType === "user_message" || event.eventType === "assistant_message") {
    const content = canonicalContent(event);
    if ((content.eventType === "user_message" || content.eventType === "assistant_message") && content.payload.phase === "complete") {
      return [
        { type: EventType.TEXT_MESSAGE_START, messageId: content.payload.messageId, role: event.eventType === "user_message" ? "user" : "assistant" },
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId: content.payload.messageId, delta: content.payload.content },
        { type: EventType.TEXT_MESSAGE_END, messageId: content.payload.messageId },
      ];
    }
  }
  return [projectReplayEvent(event, threadId)];
}

function canonicalContent(event: AgentConversationEventRecord) {
  return AgentConversationEventContentSchema.parse({ eventType: event.eventType, schemaVersion: event.schemaVersion, payload: event.payload });
}

function genericStateSnapshot(event: AgentConversationEventRecord): BaseEvent {
  return { type: EventType.STATE_SNAPSHOT, snapshot: { eventId: event.id, sequence: event.sequence.toString(), eventType: event.eventType, payload: event.payload } };
}

function replayEventMessageId(event: AgentConversationEventRecord): string {
  const publicName = (event as unknown as { name?: unknown }).name;
  const candidate = event.id ?? publicName;
  if (typeof candidate !== "string" || !candidate) throw new Error("Replay activity has no stable message id.");
  return candidate;
}

function parseShared<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}
