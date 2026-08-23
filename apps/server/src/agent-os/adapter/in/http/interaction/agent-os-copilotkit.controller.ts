import { All, BadRequestException, Controller, Get, Inject, Req, Res } from "@nestjs/common";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { CurrentOrganization } from "../../../../../auth/decorators/current-organization.decorator";
import { CurrentUser } from "../../../../../auth/decorators/current-user.decorator";
import type { AuthUser } from "../../../../../auth/auth.types";
import { AGENT_AGUI_RUNNER_PORT, type AgentAguiRunnerPort } from "../../../../application/port/in/agent-agui-runner.port";
import { AGENT_AGUI_PRODUCER_PORT, type AgentAguiProducerPort } from "../../../../application/port/in/interaction/agent-agui-producer.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT, type AgentInteractionAuthorizationPort } from "../../../../application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT, type AgentInteractionBootstrapPort } from "../../../../application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_INTERACTION_LIVE_EVENTS_PORT, type AgentInteractionLiveEventsPort } from "../../../../application/port/in/interaction/agent-interaction-live-events.port";
import { AGENT_SESSION_APPROVAL_DECISION_PORT, type AgentSessionApprovalDecisionPort } from "../../../../application/port/in/session-control/agent-session-approval-decision.port";
import { AgentOsCopilotKitAgent } from "./agent-os-copilotkit.agent";
import { AgentOsCopilotKitRunner } from "./agent-os-copilotkit.runner";
import { CopilotSseRuntime, createCopilotRuntimeHandler } from "./copilotkit-v2-runtime";

/** Same-origin public CopilotKit v2 Fetch transport, mounted below Nest's /api prefix. */
@Controller("copilotkit")
export class AgentOsCopilotKitController {
  constructor(
    @Inject(AGENT_INTERACTION_BOOTSTRAP_PORT) private readonly bootstrap: AgentInteractionBootstrapPort,
    @Inject(AGENT_INTERACTION_AUTHORIZATION_PORT) private readonly authorization: AgentInteractionAuthorizationPort,
    @Inject(AGENT_INTERACTION_LIVE_EVENTS_PORT) private readonly live: AgentInteractionLiveEventsPort,
    @Inject(AGENT_AGUI_RUNNER_PORT) private readonly runs: AgentAguiRunnerPort,
    @Inject(AGENT_AGUI_PRODUCER_PORT) private readonly producers: AgentAguiProducerPort,
    @Inject(AGENT_SESSION_APPROVAL_DECISION_PORT) private readonly approvals: AgentSessionApprovalDecisionPort,
  ) {}

  /** Read-only same-origin bootstrap; interaction transport stays under one API root. */
  @Get("bootstrap")
  bootstrapInteraction(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.bootstrap.bootstrap({ organizationId, userId: user.id });
  }

  @All(["", "*path"])
  async handle(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const principal = Object.freeze({ organizationId, userId: user.id });
    const disconnected = new AbortController();
    request.once("aborted", () => disconnected.abort());
    response.once("close", () => {
      if (!response.writableEnded) disconnected.abort();
    });
    const allowed = await this.bootstrap.bootstrap(principal);
    const agents = Object.fromEntries(allowed.agents.map((agent) => [agent.agentDefinitionKey,
      new AgentOsCopilotKitAgent(principal, agent.agentDefinitionKey, this.authorization, this.runs, this.approvals, this.producers),
    ]));
    const defaultAgent = allowed.defaultAgentDefinitionKey;
    const runtime = new CopilotSseRuntime({
      agents: agents as never,
      runner: new AgentOsCopilotKitRunner(principal, defaultAgent, this.authorization, this.live, this.runs, disconnected.signal),
      forwardHeaders: { allow: ["cookie"], deny: ["authorization"], denyPrefixes: ["x-"] },
    });
    const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit", activateChannels: false });
    let result: globalThis.Response;
    try {
      result = await handler(toFetchRequest(request, disconnected.signal));
    } catch (error) {
      if (disconnected.signal.aborted || response.destroyed) return;
      throw error;
    }
    response.status(result.status);
    copyCopilotRuntimeHeaders(response, result.headers);
    if (!result.body) { response.end(); return; }
    try {
      await pipeline(Readable.fromWeb(result.body as never), response, { signal: disconnected.signal });
    } catch (error) {
      // A client-aborted SSE response owns cancellation of the Fetch body and
      // Node source. The durable producer remains independent in the shared
      // coordinator and therefore continues to append canonical events.
      if (disconnected.signal.aborted || response.destroyed) return;
      throw error;
    }
  }
}

/**
 * Prevent intermediary response transforms from buffering the never-ending
 * CopilotKit SSE stream. In particular, Next's same-origin rewrite honors
 * `no-transform`; otherwise browser Accept-Encoding selects gzip and the
 * proxy withholds small replay frames until the stream closes.
 */
export function copyCopilotRuntimeHeaders(response: Response, headers: Headers): void {
  headers.forEach((value: string, key: string) => response.setHeader(key, value));
  if (!headers.get("content-type")?.toLowerCase().includes("text/event-stream")) return;
  const cacheControl = headers.get("cache-control") ?? "no-cache";
  response.setHeader(
    "Cache-Control",
    cacheControl.includes("no-transform") ? cacheControl : `${cacheControl}, no-transform`,
  );
  response.setHeader("Content-Encoding", "identity");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
}

export function toFetchRequest(request: Request, signal?: AbortSignal): globalThis.Request {
  const method = request.method;
  const url = new URL(request.originalUrl, `${request.protocol}://${request.get("host")}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  const init: RequestInit = { method, headers, signal };
  if (method !== "GET" && method !== "HEAD") {
    const contentType = request.header("content-type") ?? "";
    const contentLength = request.header("content-length");
    const declaresBody = (contentLength !== undefined && contentLength !== "0") ||
      request.header("transfer-encoding") !== undefined ||
      hasParsedRequestBody(request.body, contentType);
    if (!declaresBody) return new globalThis.Request(url, init);
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new BadRequestException("copilotkit_json_body_required");
    }
    const body = JSON.stringify(request.body ?? {});
    if (Buffer.byteLength(body, "utf8") > 1_048_576) {
      throw new BadRequestException("copilotkit_body_too_large");
    }
    init.body = body;
  }
  return new globalThis.Request(url, init);
}

function hasParsedRequestBody(body: unknown, contentType: string): boolean {
  if (body === undefined || body === null) return false;
  // Express's JSON middleware materializes a bodyless POST as `{}` even when
  // there was no request entity. Preserve that transport distinction for the
  // bodyless CopilotKit stop endpoint without accepting non-JSON bodies.
  return Boolean(contentType) ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body as Record<string, unknown>).length > 0;
}
