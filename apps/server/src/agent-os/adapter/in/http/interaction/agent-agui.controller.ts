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
import {
  AgentExecutionNameSchema,
  AgentSessionNameSchema,
  parseAgentExecutionName,
  parseAgentSessionName,
} from '@kiditem/shared/identifiers';
import { z } from 'zod';
import { ServiceAuth } from '../../../../../auth/decorators/service-auth.decorator';
import {
  AGENT_AGUI_RUNNER_PORT,
  type AgentAguiRunnerPort,
} from '../../../../application/port/in/agent-agui-runner.port';
import {
  AGENT_AGUI_PRODUCER_PORT,
  type AgentAguiProducerPort,
} from '../../../../application/port/in/interaction/agent-agui-producer.port';
import {
  AGENT_INTERACTION_AUTHORIZATION_PORT,
  type AgentInteractionAuthorizationPort,
} from '../../../../application/port/in/interaction/agent-interaction-authorization.port';
import { LocalAguiProducerCoordinator } from './agui-producer-coordinator';
import {
  AGENT_CONVERSATION_LIVE_PUBLISHER,
  type AgentConversationLivePointer,
  type AgentConversationLivePublisherPort,
} from '../../../../application/port/out/event/agent-conversation-live-publisher.port';
import {
  AGENT_INTERACTION_REPOSITORY,
  type AgentConversationEventRecord,
  type AgentInteractionRepositoryPort,
} from '../../../../application/port/out/repository/agent-interaction-repository.port';
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
  session: AgentSessionNameSchema,
  execution: AgentExecutionNameSchema,
}).strict().superRefine((input, context) => {
  try {
    parseAgentExecutionName(input.execution, input.session);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['execution'],
      message: 'execution must belong to the requested session',
    });
  }
});
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
    @Inject(AGENT_INTERACTION_AUTHORIZATION_PORT)
    private readonly identity: AgentInteractionAuthorizationPort,
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(AGENT_CONVERSATION_LIVE_PUBLISHER)
    private readonly publisher: AgentConversationLivePublisherPort | undefined,
    @Inject(AGENT_AGUI_PRODUCER_PORT)
    private readonly producers: AgentAguiProducerPort = new LocalAguiProducerCoordinator(),
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
      this.producers.attach(
        `${agentDefinitionKey}:${input.threadId}:${input.runId}`,
        () => this.runner.run({ agentDefinitionKey, input }),
      ),
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
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    const iterator = iterable[Symbol.asyncIterator]();
    let closed = false;
    let resolveClosed!: () => void;
    const closePromise = new Promise<void>((resolve) => { resolveClosed = resolve; });
    request.once('close', () => { closed = true; resolveClosed(); });
    try {
      while (!closed) {
        const outcome = await Promise.race([
          iterator.next().then((next) => ({ kind: 'next' as const, next })),
          closePromise.then(() => ({ kind: 'closed' as const })),
        ]);
        if (outcome.kind === 'closed') break;
        const { next } = outcome;
        if (next.done) break;
        if (!closed) response.write(`data: ${JSON.stringify(next.value)}\n\n`);
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
        for (const event of page.events) {
          yield replayEvent(event, authorization.copilotThreadId);
          if (event.eventType === 'run_terminal') return;
        }
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
      const phase = 'phase' in content.payload ? content.payload.phase : 'complete';
      if (phase === 'start') {
        return {
          type: EventType.TEXT_MESSAGE_START,
          messageId: content.payload.messageId,
          role: event.eventType === 'user_message' ? 'user' : 'assistant',
        };
      }
      if (phase === 'delta') {
        if (!('content' in content.payload)) throw new Error('Invalid canonical message delta.');
        return {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: content.payload.messageId,
          delta: content.payload.content,
        };
      }
      if (phase === 'end') {
        return { type: EventType.TEXT_MESSAGE_END, messageId: content.payload.messageId };
      }
      if (!('content' in content.payload)) throw new Error('Invalid canonical complete message.');
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
      if (!event.aguiRunId) {
        throw new Error('Canonical terminal event has no AG-UI run correlation.');
      }
      return content.payload.status === 'completed'
        ? {
            type: EventType.RUN_FINISHED,
            threadId,
            runId: event.aguiRunId,
          }
        : {
            type: EventType.RUN_ERROR,
            code: content.payload.errorCode ?? 'INTERACTION_RUNTIME_FAILED',
            message: 'The Agent OS runtime failed.',
            threadId,
            runId: event.aguiRunId,
          } as BaseEvent;
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
