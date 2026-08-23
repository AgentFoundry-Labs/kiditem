import { describe, expect, it } from "vitest";
import { EventType } from "@ag-ui/core";
import {
  formatAgentConversationEventName,
  formatAgentExecutionName,
  formatAgentSessionName,
} from "@kiditem/shared/identifiers";
import {
  InteractionReplayProjector,
  projectReplayEvent,
  projectReplayStream,
} from "../interaction-replay-projector";

const createdAt = new Date("2026-08-14T00:00:00.000Z");
const organizationId = "organization-1";
const sessionId = "session-1";

describe("InteractionReplayProjector", () => {
  it("maps a strict persisted page into canonical branded replay resources", () => {
    const replay = new InteractionReplayProjector().project(
      organizationId,
      { id: sessionId },
      {
        events: [
          {
            id: "event-1",
            organizationId,
            sessionId,
            executionId: "execution-1",
            aguiRunId: "run-1",
            externalEventId: "message-1",
            sequence: 1n,
            eventType: "user_message",
            schemaVersion: 1,
            payload: {
              phase: "complete",
              messageId: "message-1",
              content: "hello",
            },
            createdAt,
          },
        ],
        lastSequence: 1n,
        hasMore: false,
      },
      null,
    );

    expect(replay).toEqual({
      session: formatAgentSessionName(organizationId, sessionId),
      events: [
        {
          name: formatAgentConversationEventName(
            organizationId,
            sessionId,
            "1",
          ),
          session: formatAgentSessionName(organizationId, sessionId),
          execution: formatAgentExecutionName(
            organizationId,
            sessionId,
            "execution-1",
          ),
          aguiRunId: "run-1",
          sequence: "1",
          eventType: "user_message",
          schemaVersion: 1,
          payload: {
            phase: "complete",
            messageId: "message-1",
            content: "hello",
          },
          createdAt: createdAt.toISOString(),
        },
      ],
      nextCursor: null,
      lastSequence: "1",
    });
  });

  it("uses the persisted terminal AG-UI run id and rejects malformed canonical payloads", () => {
    expect(
      projectReplayEvent(
        {
          id: "terminal-1",
          organizationId,
          sessionId,
          executionId: "execution-1",
          aguiRunId: "agui-run-exact",
          externalEventId: "terminal-message",
          sequence: 2n,
          eventType: "run_terminal",
          schemaVersion: 1,
          payload: { status: "completed", errorCode: null },
          createdAt,
        },
        "thread-1",
      ),
    ).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: "thread-1",
      runId: "agui-run-exact",
    });

    expect(() =>
      projectReplayEvent(
        {
          id: "malformed-1",
          organizationId,
          sessionId,
          executionId: "execution-1",
          aguiRunId: null,
          externalEventId: "message-2",
          sequence: 3n,
          eventType: "assistant_message",
          schemaVersion: 1,
          payload: { phase: "delta", messageId: "message-2" },
          createdAt,
        },
        "thread-1",
      ),
    ).toThrow();
  });

  it("projects each persisted run as a complete AG-UI START/CONTENT/END stream", () => {
    const message = {
      id: "message-1",
      organizationId,
      sessionId,
      executionId: "execution-1",
      aguiRunId: "run-1",
      externalEventId: "message-1",
      sequence: 1n,
      eventType: "user_message" as const,
      schemaVersion: 1,
      payload: { phase: "complete" as const, messageId: "message-1", content: "hello" },
      createdAt,
    };
    const terminal = {
      ...message,
      id: "terminal-1",
      externalEventId: "terminal-1",
      sequence: 2n,
      eventType: "run_terminal" as const,
      payload: { status: "completed" as const, errorCode: null },
    };

    expect(projectReplayStream([message, terminal], "thread-1")).toEqual([
      { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "run-1" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "message-1", role: "user" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "message-1", delta: "hello" },
      { type: EventType.TEXT_MESSAGE_END, messageId: "message-1" },
      { type: EventType.RUN_FINISHED, threadId: "thread-1", runId: "run-1" },
    ]);
  });

  it("projects persisted durable UI snapshots as replayable CopilotKit activities", () => {
    const snapshot = {
      id: "progress-1",
      organizationId,
      sessionId,
      executionId: "execution-1",
      aguiRunId: "run-1",
      externalEventId: "progress-1",
      sequence: 3n,
      eventType: "state_snapshot" as const,
      schemaVersion: 1,
      payload: {
        snapshotType: "agent_progress",
        snapshotVersion: 1,
        data: {
          name: "kiditem.ui.agent_progress.v1",
          session: "organizations/organization-1/agentSessions/session-1",
          task: "organizations/organization-1/agentSessions/session-1/tasks/task-1",
          execution: "organizations/organization-1/agentSessions/session-1/executions/execution-1",
          status: "running",
          progress: 0.75,
          label: "승인을 기다리는 중",
          updatedAt: "2026-08-14T00:00:00.000Z",
        },
      },
      createdAt,
    };

    expect(projectReplayStream([snapshot], "thread-1")).toEqual([
      { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "run-1" },
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: "progress-1",
        activityType: "kiditem.ui.agent_progress.v1",
        content: snapshot.payload.data,
        replace: true,
      },
    ]);
  });

  it("projects a persisted approval request as a standard CopilotKit interrupt", () => {
    const session = "organizations/organization-1/agentSessions/session-1";
    const parent = {
      id: "parent-message-1",
      organizationId,
      sessionId,
      executionId: "execution-parent",
      aguiRunId: "parent-run",
      externalEventId: "parent-message-1",
      sequence: 3n,
      eventType: "user_message" as const,
      schemaVersion: 1,
      payload: { phase: "complete" as const, messageId: "parent-message-1", content: "승인 작업" },
      createdAt,
    };
    const snapshot = {
      id: "approval-1",
      organizationId,
      sessionId,
      executionId: "execution-1",
      aguiRunId: "child-run",
      externalEventId: "approval-1",
      sequence: 4n,
      eventType: "state_snapshot" as const,
      schemaVersion: 1,
      payload: {
        snapshotType: "agent_approval",
        snapshotVersion: 1,
        data: {
          name: "kiditem.ui.agent_approval.v1",
          approvalId: "00000000-0000-4000-8000-000000000001",
          session,
          task: `${session}/tasks/task-1`,
          execution: `${session}/executions/execution-1`,
          capabilityKey: "sourcing.retrieveWorkspaceEvidence",
          summary: "승인 필요",
          resourceVersions: [],
          expiresAt: "2026-08-14T00:05:00.000Z",
        },
      },
      createdAt,
    };

    const request = {
      ...snapshot,
      id: "approval-interrupt-1",
      externalEventId: "approval-interrupt-1",
      sequence: 5n,
      eventType: "hitl_request" as const,
      payload: {
        requestId: snapshot.payload.data.approvalId,
        status: "pending" as const,
        prompt: "승인 필요",
        approval: snapshot.payload.data,
      },
    };

    expect(projectReplayStream([parent, snapshot, request], "thread-1")).toEqual([
      { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "parent-run" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "parent-message-1", role: "user" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "parent-message-1", delta: "승인 작업" },
      { type: EventType.TEXT_MESSAGE_END, messageId: "parent-message-1" },
      { type: EventType.RUN_FINISHED, threadId: "thread-1", runId: "parent-run" },
      { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "child-run" },
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          eventId: "approval-1",
          sequence: "4",
          eventType: "state_snapshot",
          payload: snapshot.payload,
        },
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: "thread-1",
        runId: "child-run",
        outcome: {
          type: "interrupt",
          interrupts: [{
            id: snapshot.payload.data.approvalId,
            reason: "approval_required",
            message: "승인 필요",
            expiresAt: snapshot.payload.data.expiresAt,
            metadata: { approval: snapshot.payload.data },
          }],
        },
      },
    ]);
  });

  it("closes a parent AG-UI run before a delegated durable run starts", () => {
    const parent = {
      id: "parent-message",
      organizationId,
      sessionId,
      executionId: "execution-parent",
      aguiRunId: "parent-run",
      externalEventId: "parent-message",
      sequence: 1n,
      eventType: "user_message" as const,
      schemaVersion: 1,
      payload: { phase: "complete" as const, messageId: "parent-message", content: "delegate" },
      createdAt,
    };
    const activity = (id: string, sequence: bigint, snapshotType: "agent_progress" | "agent_delegation" | "agent_artifact", data: Record<string, unknown>) => ({
      ...parent,
      id,
      externalEventId: id,
      sequence,
      eventType: "state_snapshot" as const,
      payload: { snapshotType, snapshotVersion: 1, data },
    });
    const session = "organizations/organization-1/agentSessions/session-1";
    const events = [
      parent,
      activity("parent-progress", 2n, "agent_progress", {
        name: "kiditem.ui.agent_progress.v1", session, task: `${session}/tasks/parent`, execution: `${session}/executions/parent`,
        status: "running", progress: 0.75, label: "parent progress", updatedAt: createdAt.toISOString(),
      }),
      activity("delegation", 3n, "agent_delegation", {
        name: "kiditem.ui.agent_delegation.v1", session, parentTask: `${session}/tasks/parent`, childTask: `${session}/tasks/child`,
        fromAgentVersion: "agentDefinitions/operator/versions/1", toAgentVersion: "agentDefinitions/sourcing/versions/1", status: "created", createdAt: createdAt.toISOString(),
      }),
      activity("artifact", 4n, "agent_artifact", {
        name: "kiditem.ui.agent_artifact.v1", session, task: `${session}/tasks/parent`, execution: `${session}/executions/parent`,
        artifactId: "00000000-0000-4000-8000-000000000001", artifactType: "report", label: "report", sha256: "a".repeat(64), navigationActionId: "00000000-0000-4000-8000-000000000002", createdAt: createdAt.toISOString(),
      }),
      {
        ...activity("child-progress", 5n, "agent_progress", {
          name: "kiditem.ui.agent_progress.v1", session, task: `${session}/tasks/child`, execution: `${session}/executions/child`,
          status: "waiting_approval", progress: 0.5, label: "child progress", updatedAt: createdAt.toISOString(),
        }),
        aguiRunId: "child-run",
      },
    ];

    expect(projectReplayStream(events, "thread-1").map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.ACTIVITY_SNAPSHOT,
      EventType.ACTIVITY_SNAPSHOT,
      EventType.ACTIVITY_SNAPSHOT,
      EventType.RUN_FINISHED,
      EventType.RUN_STARTED,
      EventType.ACTIVITY_SNAPSHOT,
    ]);
  });
});
