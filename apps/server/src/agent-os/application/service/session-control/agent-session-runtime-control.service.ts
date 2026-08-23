import { Inject, Injectable } from "@nestjs/common";
import {
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
} from "@kiditem/shared/agent-interaction";
import {
  AgentExecutionAttemptIdSchema,
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
  type AgentExecutionName,
  type AgentSessionName,
  type AgentSessionTaskName,
} from "@kiditem/shared/identifiers";
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePointer,
  type AgentConversationLivePublisherPort,
} from "../../port/out/event/agent-conversation-live-publisher.port";
import type {
  AgentConversationEventRecord,
  AppendExecutionEventInput,
} from "../../port/out/repository/interaction/agent-interaction.persistence.types";
import {
  AGENT_CONVERSATION_EVENT_TRANSACTION,
  type AgentConversationEventTransactionPort,
} from "../../port/out/transaction/interaction/agent-conversation-event.transaction.port";
import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";
import {
  INTERACTION_CLOCK,
  type InteractionClock,
} from "../../port/in/interaction/interaction-clock.port";
import type { NormalizedRuntimeEvent } from "../../port/out/runtime/agent-durable-runtime.port";

export interface PersistedAgentSessionRuntimeEvent {
  readonly event: AgentConversationEventRecord;
  readonly pointer: AgentConversationLivePointer;
}

interface RuntimeEventInput {
  organizationId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  attemptId: string;
  ordinal: number;
  event: NormalizedRuntimeEvent;
}

@Injectable()
export class AgentSessionRuntimeControlService {
  constructor(
    @Inject(AGENT_CONVERSATION_EVENT_TRANSACTION)
    private readonly interactions: AgentConversationEventTransactionPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher: AgentConversationLivePublisherPort,
    @Inject(INTERACTION_CLOCK)
    private readonly now: InteractionClock,
  ) {}

  async record(
    input: RuntimeEventInput,
  ): Promise<PersistedAgentSessionRuntimeEvent> {
    const graph = parseGraph(input);
    const timestamp = this.now();
    const externalEventId =
      input.event.kind === "terminal"
        ? `${graph.attemptId}:runtime:terminal`
        : `${graph.attemptId}:runtime:${input.ordinal}:${input.event.kind}`;
    return this.persistAndPublish(
      this.persist(
        eventContent(input.event, {
          organizationId: graph.organizationId,
          sessionId: graph.sessionId,
          executionId: graph.executionId,
          externalEventId,
          session: input.session,
          task: input.task,
          execution: input.execution,
          timestamp,
          attemptId: graph.attemptId,
        }),
      ),
    );
  }

  async persist(
    input: AppendExecutionEventInput,
  ): Promise<PersistedAgentSessionRuntimeEvent> {
    const event = await this.interactions.appendExecutionEvent(input);
    return {
      event,
      pointer: {
        organizationId: event.organizationId,
        sessionId: event.sessionId,
        eventId: event.id,
        sequence: event.sequence,
      },
    };
  }

  async publish(persisted: PersistedAgentSessionRuntimeEvent): Promise<void> {
    await this.publisher.publish(persisted.pointer);
  }

  private async persistAndPublish(
    persisted: Promise<PersistedAgentSessionRuntimeEvent>,
  ): Promise<PersistedAgentSessionRuntimeEvent> {
    const event = await persisted;
    await this.publish(event);
    return event;
  }
}

function parseGraph(input: RuntimeEventInput): {
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
} {
  try {
    const session = parseAgentSessionName(input.session);
    const task = parseAgentSessionTaskName(input.task, input.session);
    const execution = parseAgentExecutionName(input.execution, input.session);
    const attemptId = AgentExecutionAttemptIdSchema.parse(input.attemptId);
    if (
      session.organization !== input.organizationId ||
      !Number.isSafeInteger(input.ordinal) ||
      input.ordinal < 0
    )
      throw new Error("invalid graph");
    return {
      organizationId: session.organization,
      sessionId: session.session,
      taskId: task.task,
      executionId: execution.execution,
      attemptId,
    };
  } catch {
    throw new AgentOsRuntimeError(
      "AGENT_SESSION_RUNTIME_EVENT_INVALID",
      "Runtime event correlation must match one canonical session graph.",
    );
  }
}

function eventContent(
  event: NormalizedRuntimeEvent,
  input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    externalEventId: string;
    session: AgentSessionName;
    task: AgentSessionTaskName;
    execution: AgentExecutionName;
    timestamp: Date;
    attemptId: string;
  },
): AppendExecutionEventInput {
  const timestamp = input.timestamp.toISOString();
  const base = {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    executionId: input.executionId,
    externalEventId: input.externalEventId,
  };
  switch (event.kind) {
    case "text_start":
      return {
        ...base,
        eventType: "assistant_message",
        schemaVersion: 1,
        payload: {
          phase: "start",
          messageId: `${input.attemptId}:assistant`,
        },
      };
    case "text_delta":
      return {
        ...base,
        eventType: "assistant_message",
        schemaVersion: 1,
        payload: {
          phase: "delta",
          messageId: `${input.attemptId}:assistant`,
          content: event.content,
        },
      };
    case "text_end":
      return {
        ...base,
        eventType: "assistant_message",
        schemaVersion: 1,
        payload: {
          phase: "end",
          messageId: `${input.attemptId}:assistant`,
        },
      };
    case "progress":
      return {
        ...base,
        eventType: "state_snapshot",
        schemaVersion: 1,
        payload: {
          snapshotType: "agent_progress",
          snapshotVersion: 1,
          data: AgentProgressEventSchema.parse({
            name: "kiditem.ui.agent_progress.v1",
            session: input.session,
            task: input.task,
            execution: input.execution,
            status: "running",
            progress: event.progress,
            label: event.label,
            updatedAt: timestamp,
          }),
        },
      };
    case "artifact":
      return {
        ...base,
        eventType: "state_snapshot",
        schemaVersion: 1,
        payload: {
          snapshotType: "agent_artifact",
          snapshotVersion: 1,
          data: AgentArtifactCardSchema.parse({
            name: "kiditem.ui.agent_artifact.v1",
            artifactId: event.artifactId,
            session: input.session,
            task: input.task,
            execution: input.execution,
            artifactType: event.payload.artifactType,
            label: event.payload.label,
            sha256: event.payload.sha256,
            navigationActionId: event.payload.navigationActionId,
            createdAt: timestamp,
          }),
        },
      };
    case "delegation":
      return {
        ...base,
        eventType: "state_snapshot",
        schemaVersion: 1,
        payload: {
          snapshotType: "agent_delegation",
          snapshotVersion: 1,
          data: AgentDelegationEventSchema.parse({
            ...event.payload,
            session: input.session,
            createdAt: timestamp,
          }),
        },
      };
    case "resource_ref":
      return {
        ...base,
        eventType: "state_snapshot",
        schemaVersion: 1,
        payload: {
          snapshotType: "agent_resource_ref",
          snapshotVersion: 1,
          data: {
            content: JSON.stringify({ resource: event.resource }),
          },
        },
      };
    case "terminal":
      return {
        ...base,
        eventType: "run_terminal",
        schemaVersion: 1,
        payload: { status: event.status, errorCode: event.errorCode ?? null },
        terminal: {
          status: event.status,
          errorCode:
            event.status === "completed" ? null : (event.errorCode ?? null),
          finishedAt: input.timestamp,
        },
      };
    case "interrupt":
      throw new AgentOsRuntimeError(
        "AGENT_RUNTIME_INTERRUPT_REQUIRES_APPROVAL",
        "Runtime interrupts must be persisted through the explicit approval boundary.",
      );
  }
}
