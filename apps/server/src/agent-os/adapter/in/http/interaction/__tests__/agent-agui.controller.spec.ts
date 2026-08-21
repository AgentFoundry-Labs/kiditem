import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";
import { AgentInteractionLiveEventsService } from "../../../../../application/service/interaction/agent-interaction-live-events.service";
import { AgentAguiProducerCoordinator } from "../../../../../application/service/agent-agui-producer-coordinator.service";
import { AgentAguiController } from "../agent-agui.controller";
import { InteractionGatewayGuard } from "../interaction-gateway.guard";

describe("AgentAguiController", () => {
  const producers = () => new AgentAguiProducerCoordinator();

  it("requires an explicitly injected producer coordinator", () => {
    const source = readFileSync(
      resolve(__dirname, "..", "agent-agui.controller.ts"),
      "utf8",
    );
    expect(source).not.toContain("LocalAguiProducerCoordinator");
    expect(source).not.toMatch(
      /AGENT_AGUI_PRODUCER_PORT\)\s*\n\s*private readonly producers:[^;=]+=/,
    );
  });

  it("is a private gateway-guarded AG-UI route", () => {
    expect(Reflect.getMetadata("path", AgentAguiController)).toBe(
      "agent-os/ag-ui",
    );
    expect(Reflect.getMetadata("__guards__", AgentAguiController)).toContain(
      InteractionGatewayGuard,
    );
  });

  it("exposes a private readiness probe used by the real interaction gateway", () => {
    const controller = new AgentAguiController(
      {} as never,
      {} as never,
      producers() as never,
    );
    expect(controller.health()).toEqual({ status: "ok" });
  });

  it("parses canonical stop resource names before forwarding private owner IDs", async () => {
    const runner = { stop: vi.fn().mockResolvedValue(true) };
    const controller = new AgentAguiController(
      runner as never,
      {} as never,
      producers() as never,
    );

    await expect(
      controller.stop("operator", {
        copilotThreadId: "thread-1",
        aguiRunId: "run-1",
        session: "organizations/org-1/agentSessions/session-1",
        execution:
          "organizations/org-1/agentSessions/session-1/executions/execution-1",
      }),
    ).resolves.toEqual({ stopped: true });
    expect(runner.stop).toHaveBeenCalledWith({
      agentDefinitionKey: "operator",
      copilotThreadId: "thread-1",
      aguiRunId: "run-1",
      sessionId: "session-1",
      executionId: "execution-1",
    });
  });

  it("detaches the response subscriber while the producer persists through terminal", async () => {
    let returned = false;
    let releaseRuntime!: () => void;
    const runtimeGate = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const produced: string[] = [];
    const runner = {
      run: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          try {
            yield {
              type: EventType.RUN_STARTED,
              threadId: "thread-1",
              runId: "run-1",
            };
            await runtimeGate;
            produced.push("terminal-persisted");
            yield {
              type: EventType.RUN_FINISHED,
              threadId: "thread-1",
              runId: "run-1",
            };
          } finally {
            returned = true;
          }
        },
      })),
      stop: vi.fn(),
    };
    const controller = new AgentAguiController(
      runner as never,
      {} as never,
      producers() as never,
    );
    let close: (() => void) | undefined;
    const request = {
      once: vi.fn((name, callback) => {
        if (name === "close") close = callback;
      }),
    };
    const response = {
      setHeader: vi.fn(),
      write: vi.fn(() => close?.()),
      end: vi.fn(),
    };

    const run = controller.run(
      "operator",
      {
        threadId: "thread-1",
        runId: "run-1",
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: {},
      } as never,
      request as never,
      response as never,
    );

    await vi.waitFor(() => expect(response.write).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    releaseRuntime();
    await run;
    await vi.waitFor(() => expect(returned).toBe(true));

    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(runner.stop).not.toHaveBeenCalled();
    expect(produced).toEqual(["terminal-persisted"]);
    expect(returned).toBe(true);
    expect(response.write).toHaveBeenCalledOnce();
  });

  it("ends a silently disconnected response without cancelling the producer", async () => {
    let close: (() => void) | undefined;
    let releaseRuntime!: () => void;
    const runtimeGate = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const persisted: string[] = [];
    const runner = {
      run: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          await runtimeGate;
          persisted.push("terminal");
          yield {
            type: EventType.RUN_FINISHED,
            threadId: "thread-1",
            runId: "run-1",
          };
        },
      })),
      stop: vi.fn(),
    };
    const controller = new AgentAguiController(
      runner as never,
      {} as never,
      producers() as never,
    );
    const request = {
      once: vi.fn((name, callback) => {
        if (name === "close") close = callback;
      }),
    };
    const response = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    };
    const run = controller.run(
      "operator",
      {
        threadId: "thread-1",
        runId: "run-1",
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: {},
      },
      request as never,
      response as never,
    );

    await vi.waitFor(() => expect(close).toBeTypeOf("function"));
    close?.();
    await expect(
      Promise.race([
        run.then(() => "detached"),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("timeout"), 25),
        ),
      ]),
    ).resolves.toBe("detached");
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledOnce();
    expect(persisted).toEqual([]);
    releaseRuntime();
    await vi.waitFor(() => expect(persisted).toEqual(["terminal"]));
  });

  it("subscribes before authoritative catch-up so live join has no replay race", async () => {
    const calls: string[] = [];
    const repository = {
      readConversationEvents: vi.fn(async () => {
        calls.push("read");
        return {
          events: [
            {
              id: "event-2",
              organizationId: "org-1",
              sessionId: "session-1",
              executionId: "execution-1",
              aguiRunId: "run-1",
              externalEventId: "assistant-1",
              sequence: 2n,
              eventType: "assistant_message",
              schemaVersion: 1,
              payload: {
                phase: "complete",
                messageId: "assistant-1",
                content: "durable answer",
              },
              createdAt: new Date("2026-08-14T00:00:00.000Z"),
            },
          ],
          lastSequence: 2n,
          hasMore: false,
        };
      }),
    };
    const publisher = {
      subscribe: vi.fn(() => {
        calls.push("subscribe");
        return vi.fn();
      }),
    };
    const abort = new AbortController();
    const service = new AgentInteractionLiveEventsService(
      {} as never,
      repository as never,
      publisher as never,
    );
    const events = (
      service as never as {
        liveEvents(
          authorization: unknown,
          signal: AbortSignal,
        ): AsyncIterable<unknown>;
      }
    ).liveEvents(
      {
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        copilotThreadId: "thread-1",
        afterSequence: 1n,
      },
      abort.signal,
    );
    const iterator = events[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: EventType.TEXT_MESSAGE_CHUNK, delta: "durable answer" },
    });
    expect(calls.slice(0, 2)).toEqual(["subscribe", "read"]);
    abort.abort();
    await iterator.return?.();
  });

  it.each([
    ["completed", EventType.RUN_FINISHED, null],
    ["failed", EventType.RUN_ERROR, "model_failed"],
    ["cancelled", EventType.RUN_ERROR, "run_cancelled"],
  ] as const)(
    "emits an exact %s canonical terminal and immediately ends live polling",
    async (status, expectedType, errorCode) => {
      const unsubscribe = vi.fn();
      const repository = {
        readConversationEvents: vi.fn().mockResolvedValue({
          events: [
            {
              id: "terminal-event-1",
              organizationId: "org-1",
              sessionId: "session-1",
              executionId: "execution-database-id",
              aguiRunId: "agui-run-exact",
              externalEventId: "terminal-1",
              sequence: 9n,
              eventType: "run_terminal",
              schemaVersion: 1,
              payload: { status, errorCode },
              createdAt: new Date(),
            },
          ],
          lastSequence: 9n,
          hasMore: false,
        }),
      };
      const publisher = { subscribe: vi.fn(() => unsubscribe) };
      const abort = new AbortController();
      const service = new AgentInteractionLiveEventsService(
        {} as never,
        repository as never,
        publisher as never,
      );
      const iterator = (
        service as never as {
          liveEvents(
            authorization: unknown,
            signal: AbortSignal,
          ): AsyncIterable<BaseEvent>;
        }
      )
        .liveEvents(
          {
            organizationId: "org-1",
            userId: "user-1",
            sessionId: "session-1",
            copilotThreadId: "thread-1",
            afterSequence: 8n,
          },
          abort.signal,
        )
        [Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toMatchObject({
        value: {
          type: expectedType,
          threadId: "thread-1",
          runId: "agui-run-exact",
        },
      });
      const ended = await Promise.race([
        iterator.next(),
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), 25),
        ),
      ]);
      expect(ended).toEqual({ done: true, value: undefined });
      expect(repository.readConversationEvents).toHaveBeenCalledOnce();
      expect(unsubscribe).toHaveBeenCalledOnce();
    },
  );
});
