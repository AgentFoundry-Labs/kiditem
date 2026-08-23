import { describe, expect, it, vi } from "vitest";
import { AgentInteractionLiveEventsService } from "../agent-interaction-live-events.service";

const coordinate = {
  organizationId: "organization-1", userId: "user-1", sessionId: "session-1",
  copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 0n,
};
const createdAt = new Date("2026-08-23T00:00:00.000Z");
function event(sequence: bigint, eventType: string, payload: Record<string, unknown>, aguiRunId = "run-1") {
  return { id: `event-${sequence}`, organizationId: coordinate.organizationId, sessionId: coordinate.sessionId,
    executionId: "execution-1", aguiRunId, externalEventId: `external-${sequence}`, sequence,
    eventType, schemaVersion: 1, payload, createdAt };
}

describe("AgentInteractionLiveEventsService", () => {
  it("drains a real 501-event catch-up past an old terminal before joining the later live run", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => event(
      BigInt(index + 1),
      index === 499 ? "run_terminal" : "state_snapshot",
      index === 499 ? { status: "completed", errorCode: null } : { snapshotType: "historical_progress", snapshotVersion: 1, data: { content: "historical" } },
      "run-old",
    ));
    const later = event(501n, "assistant_message", { phase: "complete", messageId: "later-message", content: "later" }, "run-later");
    const repository = { readConversationEvents: vi.fn(async ({ afterSequence }: { afterSequence: bigint }) => afterSequence === 0n
      ? { events: firstPage, lastSequence: 500n, hasMore: true }
      : { events: [later], lastSequence: 501n, hasMore: false }) };
    const unsubscribe = vi.fn();
    const publisher = { subscribe: vi.fn(() => unsubscribe) };
    const abort = new AbortController();
    const service = new AgentInteractionLiveEventsService(repository as never, publisher as never);
    const stream = await service.open({ coordinate, signal: abort.signal });
    const received = [];
    for await (const value of stream) {
      received.push(value);
      if (value.type === "TEXT_MESSAGE_END") abort.abort();
    }
    expect(repository.readConversationEvents).toHaveBeenCalledTimes(2);
    expect(received).toContainEqual({ type: "RUN_STARTED", threadId: "thread-1", runId: "run-later" });
    expect(received).toContainEqual({ type: "TEXT_MESSAGE_END", messageId: "later-message" });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("uses the same stateful projector through catch-up and publisher join without a replay/live gap", async () => {
    let listener: ((pointer: { organizationId: string; sessionId: string; eventId: string; sequence: bigint }) => void) | null = null;
    const repository = { readConversationEvents: vi.fn(async ({ afterSequence }: { afterSequence: bigint }) => {
      if (afterSequence === 0n) {
        listener?.({ organizationId: coordinate.organizationId, sessionId: coordinate.sessionId, eventId: "event-2", sequence: 2n });
        return { events: [event(1n, "assistant_message", { phase: "complete", messageId: "message-1", content: "first" })], lastSequence: 1n, hasMore: false };
      }
      return { events: [event(2n, "run_terminal", { status: "completed", errorCode: null })], lastSequence: 2n, hasMore: false };
    }) };
    const publisher = { subscribe: vi.fn((_scope, next) => { listener = next; return vi.fn(); }) };
    const service = new AgentInteractionLiveEventsService(repository as never, publisher as never);
    const events = [];
    for await (const value of await service.open({ coordinate, signal: new AbortController().signal })) events.push(value);

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      { type: "TEXT_MESSAGE_START", messageId: "message-1", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "first" },
      { type: "TEXT_MESSAGE_END", messageId: "message-1" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" },
    ]);
    expect(publisher.subscribe).toHaveBeenCalledOnce();
  });

  it("projects a live HITL request as an interrupt and unsubscribes without reviving it", async () => {
    const requestId = "00000000-0000-4000-8000-000000000001";
    const session = "organizations/organization-1/agentSessions/session-1";
    const approval = {
      name: "kiditem.ui.agent_approval.v1", approvalId: requestId, session,
      task: `${session}/tasks/task-1`, execution: `${session}/executions/execution-1`,
      capabilityKey: "sourcing.retrieveWorkspaceEvidence", summary: "approve",
      resourceVersions: [], expiresAt: "2026-08-23T01:00:00.000Z",
    };
    const unsubscribe = vi.fn();
    const repository = { readConversationEvents: vi.fn(async () => ({ events: [
      event(1n, "assistant_message", { phase: "complete", messageId: "message-1", content: "needs approval" }),
      event(2n, "hitl_request", { requestId, status: "pending", prompt: "approve", approval }),
      event(3n, "hitl_decision", { requestId, decision: "approved" }),
      event(4n, "run_terminal", { status: "completed", errorCode: null }),
    ], lastSequence: 3n, hasMore: false })) };
    const publisher = { subscribe: vi.fn(() => unsubscribe) };
    const service = new AgentInteractionLiveEventsService(repository as never, publisher as never);
    const events = [];
    for await (const value of await service.open({ coordinate, signal: new AbortController().signal })) events.push(value);

    expect(events).toEqual(expect.arrayContaining([
      { type: "TEXT_MESSAGE_END", messageId: "message-1" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" },
    ]));
    expect(events).not.toContainEqual(expect.objectContaining({ outcome: expect.objectContaining({ type: "interrupt" }) }));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not interrupt when a publisher-woken 500-event page resolves HITL on its next page", async () => {
    const requestId = "00000000-0000-4000-8000-000000000002";
    const session = "organizations/organization-1/agentSessions/session-1";
    const approval = {
      name: "kiditem.ui.agent_approval.v1", approvalId: requestId, session,
      task: `${session}/tasks/task-1`, execution: `${session}/executions/execution-1`,
      capabilityKey: "sourcing.retrieveWorkspaceEvidence", summary: "approve",
      resourceVersions: [], expiresAt: "2026-08-23T01:00:00.000Z",
    };
    let listener: ((pointer: { organizationId: string; sessionId: string; eventId: string; sequence: bigint }) => void) | null = null;
    let initialRead = true;
    const abort = new AbortController();
    const repository = { readConversationEvents: vi.fn(async ({ afterSequence }: { afterSequence: bigint }) => {
      if (afterSequence === 0n && initialRead) {
        initialRead = false;
        return { events: [], lastSequence: 0n, hasMore: false };
      }
      if (afterSequence === 500n) return {
        events: [event(501n, "hitl_decision", { requestId, decision: "approved" })],
        lastSequence: 501n, hasMore: false,
      };
      return {
        events: Array.from({ length: 500 }, (_, index) => index === 499
          ? event(500n, "hitl_request", { requestId, status: "pending", prompt: "approve", approval })
          : event(BigInt(index + 1), "state_snapshot", { snapshotType: "historical_progress", snapshotVersion: 1, data: { content: "historical" } })),
        lastSequence: 500n, hasMore: true,
      };
    }) };
    const publisher = { subscribe: vi.fn((_scope, next) => { listener = next; return vi.fn(); }) };
    const service = new AgentInteractionLiveEventsService(repository as never, publisher as never);
    const values: unknown[] = [];
    const stream = await service.open({ coordinate, signal: abort.signal });
    const consuming = (async () => {
      for await (const value of stream) values.push(value);
    })();

    await vi.waitFor(() => expect(publisher.subscribe).toHaveBeenCalledOnce());
    listener?.({ organizationId: coordinate.organizationId, sessionId: coordinate.sessionId, eventId: "event-501", sequence: 501n });
    await vi.waitFor(() => expect(repository.readConversationEvents).toHaveBeenCalledWith(expect.objectContaining({ afterSequence: 500n })));
    abort.abort();
    await consuming;
    expect(repository.readConversationEvents).toHaveBeenCalledWith(expect.objectContaining({ afterSequence: 500n }));
    expect(values).not.toContainEqual(expect.objectContaining({ outcome: expect.objectContaining({ type: "interrupt" }) }));
  });
});
