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
} from '@nestjs/common';
import { EventType, RunAgentInputSchema, type BaseEvent } from '@ag-ui/core';
import { AgentConversationEventContentSchema } from '@kiditem/shared/agent-interaction';
import { z } from 'zod';
import { ServiceAuth } from '../../../../auth/decorators/service-auth.decorator';
import {
  AGENT_AGUI_RUNNER_PORT,
  type AgentAguiRunnerPort,
} from '../../../application/port/in/agent-agui-runner.port';
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePointer,
  type AgentConversationLivePublisherPort,
} from '../../../application/port/out/event/agent-conversation-live-publisher.port';
import {
  AGENT_INTERACTION_REPOSITORY,
  type AgentConversationEventRecord,
  type AgentInteractionRepositoryPort,
} from '../../../application/port/out/repository/agent-interaction-repository.port';
import { AgentInteractionIdentityService } from '../../../application/service/agent-interaction-identity.service';
import { interactionHttpCall } from './interaction-http-error';
import { InteractionGatewayGuard } from './interaction-gateway.guard';
import type { Request, Response } from 'express';

const ConnectSchema = z.object({
  copilotThreadId: z.string().min(1),
  afterSequence: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  liveJoinToken: z.string().min(32).max(4096),
}).strict();
const StopSchema = z.object({
  copilotThreadId: z.string().min(1),
  aguiRunId: z.string().min(1),
  sessionId: z.string().min(1),
  executionId: z.string().min(1),
}).strict();
const RUN_KEYS = new Set([
  'threadId', 'runId', 'parentRunId', 'state', 'messages', 'tools', 'context',
  'forwardedProps', 'resume',
]);
const CATCH_UP_LIMIT = 500;
const CATCH_UP_INTERVAL_MS = 1_000;

@Controller('agent-os/ag-ui')
@UseGuards(InteractionGatewayGuard)
export class AgentAguiController {
  constructor(
    @Inject(AGENT_AGUI_RUNNER_PORT)
    private readonly runner: AgentAguiRunnerPort,
    private readonly identity: AgentInteractionIdentityService,
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher?: AgentConversationLivePublisherPort,
  ) {}

  @Get('health')
  @ServiceAuth()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post(':agentDefinitionKey')
  @ServiceAuth()
  async run(
    @Param('agentDefinitionKey') agentDefinitionKey: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const input = parseOfficialRunInput(body);
    await this.stream(
      this.runner.run({ agentDefinitionKey, input }),
      request,
      response,
    );
  }

  @Post(':agentDefinitionKey/connect')
  @ServiceAuth()
  async connect(
    @Param('agentDefinitionKey') agentDefinitionKey: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const input = ConnectSchema.parse(body);
    const authorization = await interactionHttpCall(() =>
      this.identity.authorizeLiveJoin({
        agentDefinitionKey,
        copilotThreadId: input.copilotThreadId,
        afterSequence: BigInt(input.afterSequence),
        liveJoinToken: input.liveJoinToken,
      }),
    );
    await this.stream(
      this.liveEvents(authorization, request),
      request,
      response,
    );
  }

  @Post(':agentDefinitionKey/stop')
  @ServiceAuth()
  async stop(
    @Param('agentDefinitionKey') agentDefinitionKey: string,
    @Body() body: unknown,
  ): Promise<{ stopped: boolean }> {
    const input = StopSchema.parse(body);
    return interactionHttpCall(async () => ({
      stopped: await this.runner.stop({ agentDefinitionKey, ...input }),
    }));
  }

  private async stream(
    iterable: AsyncIterable<BaseEvent>,
    request: Request,
    response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    const iterator = iterable[Symbol.asyncIterator]();
    let closed = false;
    request.once('close', () => {
      closed = true;
      void iterator.return?.();
    });
    try {
      while (!closed) {
        const next = await iterator.next();
        if (next.done) break;
        response.write(`data: ${JSON.stringify(next.value)}\n\n`);
      }
    } finally {
      await iterator.return?.();
      if (!response.writableEnded) response.end();
    }
  }

  private async *liveEvents(
    authorization: {
      organizationId: string;
      userId: string;
      sessionId: string;
      copilotThreadId: string;
      afterSequence: bigint;
    },
    request: Request,
  ): AsyncIterable<BaseEvent> {
    let afterSequence = authorization.afterSequence;
    const queue: AgentConversationLivePointer[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = this.publisher?.subscribe(authorization, (pointer) => {
      queue.push(pointer);
      wake?.();
    }) ?? (() => undefined);
    let closed = false;
    request.once('close', () => { closed = true; wake?.(); });
    try {
      while (!closed) {
        const page = await this.repository.readConversationEvents({
          organizationId: authorization.organizationId,
          userId: authorization.userId,
          sessionId: authorization.sessionId,
          afterSequence,
          limit: CATCH_UP_LIMIT,
        });
        for (const event of page.events) yield replayEvent(event, authorization.copilotThreadId);
        afterSequence = page.lastSequence;
        if (page.hasMore) continue;
        queue.splice(0, queue.length);
        await new Promise<void>((resolve) => {
          wake = resolve;
          const timer = setTimeout(resolve, CATCH_UP_INTERVAL_MS);
          timer.unref?.();
        });
        wake = null;
      }
    } finally {
      unsubscribe();
    }
  }
}

function parseOfficialRunInput(value: unknown) {
  const candidate = record(value);
  if (Object.keys(candidate).some((key) => !RUN_KEYS.has(key))) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: [],
      message: 'Unknown AG-UI run field.',
    }]);
  }
  const input = RunAgentInputSchema.parse(candidate);
  const forwarded = record(input.forwardedProps);
  if (Object.keys(forwarded).some((key) => key !== 'kiditemAuthorization')) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ['forwardedProps'],
      message: 'Unknown forwarded authority field.',
    }]);
  }
  return input;
}

function replayEvent(
  event: AgentConversationEventRecord,
  threadId: string,
): BaseEvent {
  switch (event.eventType) {
    case 'user_message':
    case 'assistant_message': {
      const content = canonicalContent(event);
      if (content.eventType !== 'user_message' && content.eventType !== 'assistant_message') {
        throw new Error('Invalid canonical message event.');
      }
      return {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: content.payload.messageId,
        role: event.eventType === 'user_message' ? 'user' : 'assistant',
        delta: content.payload.content,
      };
    }
    case 'run_terminal': {
      const content = canonicalContent(event);
      if (content.eventType !== 'run_terminal') {
        throw new Error('Invalid canonical terminal event.');
      }
      return content.payload.status === 'completed'
        ? {
            type: EventType.RUN_FINISHED,
            threadId,
            runId: event.executionId ?? event.id,
          }
        : {
            type: EventType.RUN_ERROR,
            code: content.payload.errorCode ?? 'INTERACTION_RUNTIME_FAILED',
            message: 'The Agent OS runtime failed.',
          };
    }
    default:
      return {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          eventId: event.id,
          sequence: event.sequence.toString(),
          eventType: event.eventType,
          payload: event.payload,
        },
      };
  }
}

function canonicalContent(event: AgentConversationEventRecord) {
  return AgentConversationEventContentSchema.parse({
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
