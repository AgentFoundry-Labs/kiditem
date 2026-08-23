import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_AGUI_RUNNER_PORT } from "../../../../../application/port/in/agent-agui-runner.port";
import { AGENT_AGUI_PRODUCER_PORT } from "../../../../../application/port/in/interaction/agent-agui-producer.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "../../../../../application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "../../../../../application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_INTERACTION_LIVE_EVENTS_PORT } from "../../../../../application/port/in/interaction/agent-interaction-live-events.port";
import { AGENT_SESSION_APPROVAL_DECISION_PORT } from "../../../../../application/port/in/session-control/agent-session-approval-decision.port";
import { AgentOsCopilotKitController, copyCopilotRuntimeHeaders, toFetchRequest } from "../agent-os-copilotkit.controller";

describe("AgentOsCopilotKitController", () => {
  let app: INestApplication | null = null;
  afterEach(async () => { if (app) await app.close(); app = null; });

  it("forwards the already-parsed bounded JSON body for a CopilotKit POST subpath", async () => {
    const request = toFetchRequest({
      method: "POST",
      originalUrl: "/api/copilotkit/agent/operator/run",
      protocol: "http",
      headers: { "content-type": "application/json" },
      header: () => "application/json",
      get: () => "localhost:4000",
      body: { threadId: "thread-1", messages: [{ role: "user", content: "hello" }] },
    } as never);

    expect(request.url).toBe("http://localhost:4000/api/copilotkit/agent/operator/run");
    await expect(request.json()).resolves.toEqual({
      threadId: "thread-1",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("rejects a non-JSON POST rather than forwarding a consumed request stream", () => {
    expect(() => toFetchRequest({
      method: "POST",
      originalUrl: "/api/copilotkit/agent/operator/connect",
      protocol: "http",
      headers: { "content-type": "text/plain" },
      header: () => "text/plain",
      get: () => "localhost:4000",
      body: "not-json",
    } as never)).toThrow("copilotkit_json_body_required");
  });

  it("allows a bodyless POST control subpath without inventing a JSON body", async () => {
    const request = toFetchRequest({
      method: "POST",
      originalUrl: "/api/copilotkit/agent/operator/stop/thread-1",
      protocol: "http",
      headers: { "content-length": "0" },
      header: (name: string) => name === "content-length" ? "0" : undefined,
      get: () => "localhost:4000",
      body: {}, // Express JSON middleware represents a bodyless POST this way.
    } as never);

    expect(request.method).toBe("POST");
    await expect(request.text()).resolves.toBe("");
  });

  it("propagates the Node disconnect signal into the CopilotKit Fetch request", () => {
    const disconnected = new AbortController();
    const fetchRequest = toFetchRequest({
      method: "GET",
      originalUrl: "/api/copilotkit/agent/operator/connect",
      protocol: "http",
      headers: {},
      header: () => undefined,
      get: () => "localhost:4000",
    } as never, disconnected.signal);

    expect(fetchRequest.signal.aborted).toBe(false);
    disconnected.abort(new Error("client disconnected"));
    expect(fetchRequest.signal.aborted).toBe(true);
  });

  it("marks SSE responses no-transform and flushes replay frames through the same-origin rewrite", () => {
    const response = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
    } as never;

    copyCopilotRuntimeHeaders(response, new Headers({
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    }));

    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Encoding", "identity");
    expect(response.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    expect(response.flushHeaders).toHaveBeenCalledOnce();
  });
  it("resolves from a TestingModule using only direct Agent OS input ports", async () => {
    const bootstrap = { bootstrap: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [AgentOsCopilotKitController],
      providers: [
        { provide: AGENT_INTERACTION_BOOTSTRAP_PORT, useValue: bootstrap },
        { provide: AGENT_INTERACTION_AUTHORIZATION_PORT, useValue: {} },
        { provide: AGENT_INTERACTION_LIVE_EVENTS_PORT, useValue: {} },
        { provide: AGENT_AGUI_RUNNER_PORT, useValue: {} },
        { provide: AGENT_AGUI_PRODUCER_PORT, useValue: {} },
        { provide: AGENT_SESSION_APPROVAL_DECISION_PORT, useValue: {} },
      ],
    }).compile();
    expect(module.get(AgentOsCopilotKitController)).toBeInstanceOf(AgentOsCopilotKitController);
    expect(bootstrap.bootstrap).not.toHaveBeenCalled();
  });

  it("serves the public info route from the normal authenticated organization scope", async () => {
    const bootstrap = { bootstrap: vi.fn(async () => ({
      defaultAgentDefinitionKey: "operator",
      agents: [{ agentDefinitionKey: "operator", agentVersion: "agentDefinitions/operator/versions/1", displayName: "Operator", description: "", isDefault: true }],
      sessions: [],
    })) };
    const module = await Test.createTestingModule({
      controllers: [AgentOsCopilotKitController],
      providers: [
        { provide: AGENT_INTERACTION_BOOTSTRAP_PORT, useValue: bootstrap },
        { provide: AGENT_INTERACTION_AUTHORIZATION_PORT, useValue: {} },
        { provide: AGENT_INTERACTION_LIVE_EVENTS_PORT, useValue: {} },
        { provide: AGENT_AGUI_RUNNER_PORT, useValue: {} },
        { provide: AGENT_AGUI_PRODUCER_PORT, useValue: {} },
        { provide: AGENT_SESSION_APPROVAL_DECISION_PORT, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.use((req: Request & { authUser?: { id: string; organizationId: string } }, _res: Response, next: NextFunction) => {
      req.authUser = { id: "user-1", organizationId: "organization-1" };
      next();
    });
    await app.init();
    await request(app.getHttpServer()).get("/api/copilotkit/info").expect(200);
    expect(bootstrap.bootstrap).toHaveBeenCalledWith({ organizationId: "organization-1", userId: "user-1" });
  });

  it("serves the read-only bootstrap beneath the same CopilotKit API root", async () => {
    const result = { defaultAgentDefinitionKey: "operator", agents: [], sessions: [] };
    const bootstrap = { bootstrap: vi.fn(async () => result) };
    const module = await Test.createTestingModule({
      controllers: [AgentOsCopilotKitController],
      providers: [
        { provide: AGENT_INTERACTION_BOOTSTRAP_PORT, useValue: bootstrap },
        { provide: AGENT_INTERACTION_AUTHORIZATION_PORT, useValue: {} },
        { provide: AGENT_INTERACTION_LIVE_EVENTS_PORT, useValue: {} },
        { provide: AGENT_AGUI_RUNNER_PORT, useValue: {} },
        { provide: AGENT_AGUI_PRODUCER_PORT, useValue: {} },
        { provide: AGENT_SESSION_APPROVAL_DECISION_PORT, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.use((req: Request & { authUser?: { id: string; organizationId: string } }, _res: Response, next: NextFunction) => {
      req.authUser = { id: "user-1", organizationId: "organization-1" };
      next();
    });
    await app.init();

    await request(app.getHttpServer()).get("/api/copilotkit/bootstrap").expect(200, result);
    expect(bootstrap.bootstrap).toHaveBeenCalledWith({ organizationId: "organization-1", userId: "user-1" });
  });
});
