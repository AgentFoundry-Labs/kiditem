import { describe, expect, it, vi } from "vitest";
import { lastValueFrom, toArray } from "rxjs";
import { AgentOsCopilotKitRunner } from "../agent-os-copilotkit.runner";
import { AgentOsBoundaryError } from "../../../../../domain/agent-os.errors";

const principal = { organizationId: "organization-1", userId: "user-1" };

describe("AgentOsCopilotKitRunner", () => {
  it("reconnects through the direct authorization/live ports with the immutable principal", async () => {
    const coordinate = { ...principal, sessionId: "session-1", copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 0n };
    const authorization = {
      authorizeConnection: vi.fn(async () => ({ authorization: {}, replay: { events: [] }, liveCoordinate: coordinate })),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn(async () => (async function* () { yield { type: "STATE_SNAPSHOT", snapshot: {} }; })()) };
    const signal = new AbortController();
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, signal.signal);
    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));
    expect(events).toHaveLength(1);
    expect(authorization.authorizeConnection).toHaveBeenCalledWith({ ...principal, agentDefinitionKey: "operator", copilotThreadId: "thread-1", afterSequence: "0" });
    expect(live.open).toHaveBeenCalledWith({ coordinate, signal: signal.signal, projector: expect.anything() });
  });

  it("drains every replay page once before joining live, retaining framing across the boundary", async () => {
    const coordinate = { ...principal, sessionId: "session-1", copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 501n };
    const authorization = {
      authorizeConnection: vi.fn(async ({ afterSequence }: { afterSequence: string }) => afterSequence === "0"
        ? { authorization: {}, replay: { events: [{ id: "start", eventType: "assistant_message", schemaVersion: 1, payload: { phase: "start", messageId: "message-1" }, aguiRunId: "run-1" }], nextCursor: "500" }, liveCoordinate: null }
        : { authorization: {}, replay: { events: [{ id: "end", eventType: "assistant_message", schemaVersion: 1, payload: { phase: "end", messageId: "message-1" }, aguiRunId: "run-1" }], nextCursor: null }, liveCoordinate: coordinate }),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn(async () => (async function* () { yield { type: "STATE_SNAPSHOT", snapshot: { live: true } }; })()) };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, new AbortController().signal);

    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      { type: "TEXT_MESSAGE_START", messageId: "message-1", role: "assistant" },
      { type: "TEXT_MESSAGE_END", messageId: "message-1" },
      { type: "STATE_SNAPSHOT", snapshot: { live: true } },
    ]);
    expect(authorization.authorizeConnection).toHaveBeenNthCalledWith(2, expect.objectContaining({ afterSequence: "500" }));
    expect(live.open).toHaveBeenCalledWith({ coordinate, signal: expect.any(AbortSignal), projector: expect.anything() });
  });

  it("does not let a historical terminal stop a 501+ page replay before a later run and final live join", async () => {
    const coordinate = { ...principal, sessionId: "session-1", copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 501n };
    const authorization = {
      authorizeConnection: vi.fn(async ({ afterSequence }: { afterSequence: string }) => afterSequence === "0"
        ? { authorization: {}, replay: { events: [{ id: "old-terminal", eventType: "run_terminal", schemaVersion: 1, payload: { status: "completed", errorCode: null }, aguiRunId: "run-old" }], nextCursor: "500" }, liveCoordinate: null }
        : { authorization: {}, replay: { events: [{ id: "new-start", eventType: "assistant_message", schemaVersion: 1, payload: { phase: "start", messageId: "message-new" }, aguiRunId: "run-new" }], nextCursor: null }, liveCoordinate: coordinate }),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn(async () => (async function* () { yield { type: "TEXT_MESSAGE_END", messageId: "message-new" }; })()) };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, new AbortController().signal);

    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-old" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-old" },
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-new" },
      { type: "TEXT_MESSAGE_START", messageId: "message-new", role: "assistant" },
      { type: "TEXT_MESSAGE_END", messageId: "message-new" },
    ]);
    expect(authorization.authorizeConnection).toHaveBeenCalledTimes(2);
    expect(live.open).toHaveBeenCalledWith({ coordinate, signal: expect.any(AbortSignal), projector: expect.anything() });
  });

  it("replays a terminal stream without retaining a live browser connection", async () => {
    const coordinate = { ...principal, sessionId: "session-1", copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 3n };
    const authorization = {
      authorizeConnection: vi.fn(async () => ({
        authorization: {},
        replay: {
          events: [{ id: "event-3", eventType: "run_terminal", schemaVersion: 1, payload: { status: "completed", errorCode: null }, aguiRunId: "run-1" }],
        },
        liveCoordinate: coordinate,
      })),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn(async () => (async function* () { yield { type: "STATE_SNAPSHOT", snapshot: { unexpected: true } }; })()) };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, new AbortController().signal);

    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" },
    ]);
    expect(live.open).not.toHaveBeenCalled();
  });

  it("finalizes an approval interrupt replay so CopilotKit can mount its standard interrupt", async () => {
    const coordinate = { ...principal, sessionId: "session-1", copilotThreadId: "thread-1", contextEpoch: 1, afterSequence: 3n };
    const session = "organizations/organization-1/agentSessions/session-1";
    const approval = {
      name: "kiditem.ui.agent_approval.v1",
      approvalId: "00000000-0000-4000-8000-000000000001",
      session,
      task: `${session}/tasks/task-1`,
      execution: `${session}/executions/execution-1`,
      capabilityKey: "sourcing.retrieveWorkspaceEvidence",
      summary: "approval required",
      resourceVersions: [],
      expiresAt: "2026-08-14T00:05:00.000Z",
    };
    const authorization = {
      authorizeConnection: vi.fn(async () => ({
        authorization: {},
        replay: {
          events: [{
            id: "event-3", eventType: "hitl_request", schemaVersion: 1,
            payload: { requestId: approval.approvalId, status: "pending", prompt: approval.summary, approval },
            aguiRunId: "run-1",
          }],
        },
        liveCoordinate: coordinate,
      })),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn() };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, new AbortController().signal);

    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      expect.objectContaining({ type: "RUN_FINISHED", outcome: expect.objectContaining({ type: "interrupt" }) }),
    ]);
    expect(live.open).not.toHaveBeenCalled();
  });

  it("preserves the public replay envelope name as an AG-UI activity message id", async () => {
    const envelopeName = "organizations/organization-1/agentSessions/session-1/events/6";
    const authorization = {
      authorizeConnection: vi.fn(async () => ({
        authorization: {},
        replay: {
          events: [{
            name: envelopeName,
            eventType: "state_snapshot",
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
                label: "replayed progress",
                updatedAt: "2026-08-14T00:00:00.000Z",
              },
            },
            aguiRunId: "run-1",
          }],
        },
        liveCoordinate: null,
      })),
      authorizeCurrentRun: vi.fn(),
    };
    const runner = new AgentOsCopilotKitRunner(
      principal,
      "operator",
      authorization as never,
      {} as never,
      {} as never,
      new AbortController().signal,
    );

    const events = await lastValueFrom(runner.connect({ threadId: "thread-1" }).pipe(toArray()));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      expect.objectContaining({
        type: "ACTIVITY_SNAPSHOT",
        messageId: envelopeName,
        activityType: "kiditem.ui.agent_progress.v1",
      }),
    ]);
  });

  it("treats a fresh authenticated browser thread as an empty connection", async () => {
    const authorization = {
      authorizeConnection: vi.fn(async () => { throw new AgentOsBoundaryError("INTERACTION_CONNECTION_NOT_AUTHORIZED"); }),
      authorizeCurrentRun: vi.fn(),
    };
    const live = { open: vi.fn() };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, live as never, {} as never, new AbortController().signal);

    await expect(lastValueFrom(runner.connect({ threadId: "thread-fresh" }).pipe(toArray()))).resolves.toEqual([]);
    expect(live.open).not.toHaveBeenCalled();
  });

  it("reconstructs the exact current execution for status and stop without an active map", async () => {
    const authorization = {
      authorizeConnection: vi.fn(),
      authorizeCurrentRun: vi.fn(async () => ({ session: "organizations/organization-1/agentSessions/session-1", execution: "organizations/organization-1/agentSessions/session-1/executions/execution-1", aguiRunId: "run-1" })),
    };
    const runs = { stop: vi.fn(async () => true) };
    const runner = new AgentOsCopilotKitRunner(principal, "operator", authorization as never, {} as never, runs as never, new AbortController().signal);
    await expect(runner.isRunning({ threadId: "thread-1" })).resolves.toBe(true);
    await expect(runner.stop({ threadId: "thread-1", runId: "run-1" })).resolves.toBe(true);
    expect(runs.stop).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-1", executionId: "execution-1", aguiRunId: "run-1" }));
  });
});
