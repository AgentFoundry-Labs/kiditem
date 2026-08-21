import {
  Body,
  Controller,
  Inject,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { RunAgentInputSchema, type BaseEvent } from "@ag-ui/core";
import {
  AgentExecutionNameSchema,
  AgentSessionNameSchema,
  parseAgentExecutionName,
  parseAgentSessionName,
} from "@kiditem/shared/identifiers";
import { z } from "zod";
import { ServiceAuth } from "../../../../../auth/decorators/service-auth.decorator";
import {
  AGENT_AGUI_RUNNER_PORT,
  type AgentAguiRunnerPort,
} from "../../../../application/port/in/agent-agui-runner.port";
import {
  AGENT_AGUI_PRODUCER_PORT,
  type AgentAguiProducerPort,
} from "../../../../application/port/in/interaction/agent-agui-producer.port";
import {
  AGENT_INTERACTION_LIVE_EVENTS_PORT,
  type AgentInteractionLiveEventsPort,
} from "../../../../application/port/in/interaction/agent-interaction-live-events.port";
import { interactionHttpCall } from "./interaction-http-error";
import { InteractionGatewayGuard } from "./interaction-gateway.guard";
import type { Request, Response } from "express";

const ConnectSchema = z
  .object({
    copilotThreadId: z.string().min(1),
    afterSequence: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
    liveJoinToken: z.string().min(32).max(4096),
  })
  .strict();
const StopSchema = z
  .object({
    copilotThreadId: z.string().min(1),
    aguiRunId: z.string().min(1),
    session: AgentSessionNameSchema,
    execution: AgentExecutionNameSchema,
  })
  .strict()
  .superRefine((input, context) => {
    try {
      parseAgentExecutionName(input.execution, input.session);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["execution"],
        message: "execution must belong to the requested session",
      });
    }
  });
const RUN_KEYS = new Set([
  "threadId",
  "runId",
  "parentRunId",
  "state",
  "messages",
  "tools",
  "context",
  "forwardedProps",
  "resume",
]);

@Controller("agent-os/ag-ui")
@UseGuards(InteractionGatewayGuard)
export class AgentAguiController {
  constructor(
    @Inject(AGENT_AGUI_RUNNER_PORT)
    private readonly runner: AgentAguiRunnerPort,
    @Inject(AGENT_INTERACTION_LIVE_EVENTS_PORT)
    private readonly liveEvents: AgentInteractionLiveEventsPort,
    @Inject(AGENT_AGUI_PRODUCER_PORT)
    private readonly producers: AgentAguiProducerPort,
  ) {}

  @Get("health")
  @ServiceAuth()
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Post(":agentDefinitionKey")
  @ServiceAuth()
  async run(
    @Param("agentDefinitionKey") agentDefinitionKey: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const input = parseOfficialRunInput(body);
    await this.stream(
      this.producers.attach(
        `${agentDefinitionKey}:${input.threadId}:${input.runId}`,
        () => this.runner.run({ agentDefinitionKey, input }),
      ),
      request,
      response,
    );
  }

  @Post(":agentDefinitionKey/connect")
  @ServiceAuth()
  async connect(
    @Param("agentDefinitionKey") agentDefinitionKey: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const input = ConnectSchema.parse(body);
    const closed = new AbortController();
    request.once("close", () => closed.abort());
    const events = await interactionHttpCall(() =>
      this.liveEvents.open({
        agentDefinitionKey,
        copilotThreadId: input.copilotThreadId,
        afterSequence: BigInt(input.afterSequence),
        liveJoinToken: input.liveJoinToken,
        signal: closed.signal,
      }),
    );
    await this.stream(events, request, response);
  }

  @Post(":agentDefinitionKey/stop")
  @ServiceAuth()
  async stop(
    @Param("agentDefinitionKey") agentDefinitionKey: string,
    @Body() body: unknown,
  ): Promise<{ stopped: boolean }> {
    const input = StopSchema.parse(body);
    const session = parseAgentSessionName(input.session);
    const execution = parseAgentExecutionName(input.execution, input.session);
    return interactionHttpCall(async () => ({
      stopped: await this.runner.stop({
        agentDefinitionKey,
        copilotThreadId: input.copilotThreadId,
        aguiRunId: input.aguiRunId,
        sessionId: session.session,
        executionId: execution.execution,
      }),
    }));
  }

  private async stream(
    iterable: AsyncIterable<BaseEvent>,
    request: Request,
    response: Response,
  ): Promise<void> {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    const iterator = iterable[Symbol.asyncIterator]();
    let closed = false;
    let resolveClosed!: () => void;
    const closePromise = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    request.once("close", () => {
      closed = true;
      resolveClosed();
    });
    try {
      while (!closed) {
        const outcome = await Promise.race([
          iterator.next().then((next) => ({ kind: "next" as const, next })),
          closePromise.then(() => ({ kind: "closed" as const })),
        ]);
        if (outcome.kind === "closed") break;
        const { next } = outcome;
        if (next.done) break;
        if (!closed) response.write(`data: ${JSON.stringify(next.value)}\n\n`);
      }
    } finally {
      await iterator.return?.();
      if (!response.writableEnded) response.end();
    }
  }
}

function parseOfficialRunInput(value: unknown) {
  const candidate = record(value);
  if (Object.keys(candidate).some((key) => !RUN_KEYS.has(key))) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message: "Unknown AG-UI run field.",
      },
    ]);
  }
  const input = RunAgentInputSchema.parse(candidate);
  const forwarded = record(input.forwardedProps);
  if (Object.keys(forwarded).some((key) => key !== "kiditemAuthorization")) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["forwardedProps"],
        message: "Unknown forwarded authority field.",
      },
    ]);
  }
  return input;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
