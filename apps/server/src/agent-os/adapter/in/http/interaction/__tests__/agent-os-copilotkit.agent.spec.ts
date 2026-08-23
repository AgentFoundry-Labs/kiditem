import type { RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AgentOsCopilotKitAgent } from "../agent-os-copilotkit.agent";

describe("AgentOsCopilotKitAgent", () => {
  it("authorizes and runs when CopilotKit invokes run as a detached handler", async () => {
    const authorization = { authorizeRun: vi.fn(async () => ({
      session: "organizations/organization-1/agentSessions/session-1",
      execution: "organizations/organization-1/agentSessions/session-1/agentExecutions/execution-1",
    })) };
    const runner = {
      run: vi.fn(async function* () {
        yield { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" };
      }),
    };
    const agent = new AgentOsCopilotKitAgent(
      { organizationId: "organization-1", userId: "user-1" },
      "operator",
      authorization as never,
      runner as never,
      { decide: vi.fn() } as never,
      { attach: (_key: string, sourceFactory: () => AsyncIterable<unknown>) => sourceFactory() } as never,
    );

    // CopilotKit clones registered agents before executing the retained handler.
    const detachedRun = agent.clone().run;
    const events = await lastValueFrom(detachedRun({
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "message-1", role: "user", content: "hello" }],
      state: { kiditemDashboardContext: { routeKey: "global", resourceRefs: [], filters: {}, visibleRowIds: [], aggregateSummary: {}, locale: "ko-KR", timezone: "Asia/Seoul" } },
    } as RunAgentInput).pipe(toArray()));

    expect(events).toEqual([{ type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" }]);
    expect(authorization.authorizeRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-1",
      userId: "user-1",
      agentDefinitionKey: "operator",
      copilotThreadId: "thread-1",
      aguiRunId: "run-1",
    }));
  });

  it("attaches the durable run producer before the request-bound subscriber consumes it", async () => {
    const authorization = { authorizeRun: vi.fn(async () => ({
      session: "organizations/organization-1/agentSessions/session-1",
      execution: "organizations/organization-1/agentSessions/session-1/agentExecutions/execution-1",
    })) };
    const runner = {
      run: vi.fn(async function* () {
        yield { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" };
      }),
    };
    const producers = {
      attach: vi.fn((_key: string, sourceFactory: () => AsyncIterable<unknown>) => sourceFactory()),
    };
    const agent = new AgentOsCopilotKitAgent(
      { organizationId: "organization-1", userId: "user-1" },
      "operator",
      authorization as never,
      runner as never,
      { decide: vi.fn() } as never,
      producers as never,
    );

    await lastValueFrom(agent.run({
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ id: "message-1", role: "user", content: "hello" }],
      state: { kiditemDashboardContext: { routeKey: "global", resourceRefs: [], filters: {}, visibleRowIds: [], aggregateSummary: {}, locale: "ko-KR", timezone: "Asia/Seoul" } },
    } as RunAgentInput).pipe(toArray()));

    expect(producers.attach).toHaveBeenCalledWith(
      "organizations/organization-1/agentSessions/session-1/agentExecutions/execution-1:run-1",
      expect.any(Function),
    );
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it("uses the authenticated exact thread/session before deciding a standard approval resume", async () => {
    const authorization = {
      authorizeRun: vi.fn(),
      authorizeConnection: vi.fn(async () => ({ authorization: {
        session: "organizations/organization-1/agentSessions/session-1",
      } })),
    };
    const approvals = { decide: vi.fn(async () => ({ state: "approved" })) };
    const agent = new AgentOsCopilotKitAgent(
      { organizationId: "organization-1", userId: "user-1" },
      "operator",
      authorization as never,
      { run: vi.fn() } as never,
      approvals as never,
      { attach: vi.fn() } as never,
    );

    const events = await lastValueFrom(agent.run({
      threadId: "thread-1",
      runId: "resume-transport-run",
      messages: [],
      state: {},
      resume: [{
        interruptId: "00000000-0000-4000-8000-000000000001",
        status: "resolved",
        payload: {
          kind: "kiditem.agent_approval_decision.v1",
          approvalId: "00000000-0000-4000-8000-000000000001",
          session: "organizations/organization-1/agentSessions/session-1",
          decision: "approved",
          idempotencyKey: "00000000-0000-4000-8000-000000000002",
        },
      }],
    } as RunAgentInput).pipe(toArray()));

    expect(authorization.authorizeConnection).toHaveBeenCalledWith({
      organizationId: "organization-1",
      userId: "user-1",
      agentDefinitionKey: "operator",
      copilotThreadId: "thread-1",
      afterSequence: "0",
    });
    expect(approvals.decide).toHaveBeenCalledWith({
      organizationId: "organization-1",
      actorId: "user-1",
      session: "organizations/organization-1/agentSessions/session-1",
      approvalId: "00000000-0000-4000-8000-000000000001",
      decision: "approved",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
    });
    expect(authorization.authorizeRun).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "resume-transport-run" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "resume-transport-run" },
    ]);
  });
});
