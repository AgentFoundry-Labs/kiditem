import { Controller, Inject, NotFoundException, Post, Req, Res } from '@nestjs/common';
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import {
  AgentRunner,
  CopilotRuntime,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
} from '@copilotkit/runtime/v2';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
import {
  CAPABILITY_APPROVAL_REQUIRED_CUSTOM_EVENT_NAME,
  ConversationIdSchema,
  ModelSchema,
  ReasoningEffortSchema,
  type ProviderEvent,
} from '@kiditem/shared/agent-runtime';
import type { NextFunction, Request, Response, Router } from 'express';
import { defer, from, mergeMap, Observable } from 'rxjs';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import {
  CONVERSATION_PORT,
  ConversationTurnMessageSchema,
  type ConversationOwner,
  type ConversationPort,
} from '../../../../application/port/in/capability/conversation.port';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import {
  COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT,
  type CopilotkitConversationHistoryTransport,
} from './copilotkit-conversation-history.transport';

const TurnSettingsSchema = z.object({
  model: ModelSchema,
  reasoningEffort: ReasoningEffortSchema,
}).strict();

/**
 * Nest remains the authenticated incoming adapter. The public CopilotKit
 * Express adapter is used in-process, so no second HTTP hop or replay
 * store exists between the browser and the Gateway-backed conversation port.
 */
@Controller('copilotkit')
export class ConversationCopilotkitController {
  constructor(
    @Inject(CONVERSATION_PORT)
    private readonly conversations: ConversationPort,
    @Inject(COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT)
    private readonly eventHistory: CopilotkitConversationHistoryTransport,
  ) {}

  @Post()
  async handle(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await assertCopilotkitConversationAccessible(this.conversations, {
      organizationId,
      userId: user.id,
    }, request.body);
    const handler = createConversationCopilotkitExpressHandler(this.conversations, this.eventHistory, {
      organizationId,
      userId: user.id,
    });
    await invokeExpressHandler(handler, request, response);
  }
}

const COPILOTKIT_CONVERSATION_METHODS = new Set([
  'agent/run',
  'agent/connect',
  'agent/stop',
  // Kept defensive for clients that probe runner state directly. The installed
  // 1.69 single-route handler exposes run/connect/stop today.
  'agent/isRunning',
]);

/**
 * The controller owns the HTTP organization fence before a CopilotKit SSE
 * handler can open. The runner repeats this check defensively for direct
 * invocation, but no foreign request reaches SQLite replay or a provider turn.
 */
async function assertCopilotkitConversationAccessible(
  conversations: ConversationPort,
  owner: ConversationOwner,
  envelope: unknown,
): Promise<void> {
  const conversationId = conversationIdFromCopilotkitEnvelope(envelope);
  if (!conversationId) return;
  try {
    await conversations.assertAccessible({ ...owner, conversationId });
  } catch (error) {
    if (error instanceof AgentOsRuntimeError && error.code === 'conversation_not_found') {
      throw new NotFoundException();
    }
    throw error;
  }
}

function conversationIdFromCopilotkitEnvelope(envelope: unknown): string | null {
  if (!isRecord(envelope) || typeof envelope.method !== 'string' || !COPILOTKIT_CONVERSATION_METHODS.has(envelope.method)) {
    return null;
  }
  const params = isRecord(envelope.params) ? envelope.params : null;
  if (params?.agentId !== 'conversation') return null;
  const body = isRecord(envelope.body) ? envelope.body : null;
  const candidate = envelope.method === 'agent/stop'
    ? params.threadId
    : body?.threadId ?? params.threadId;
  const parsed = ConversationIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Public CopilotKit Express support consumes Nest's parsed JSON body without
 * recreating a raw HTTP stream. The per-request runtime preserves the
 * authenticated owner fence for the registered conversation agent.
 */
export function createConversationCopilotkitExpressHandler(
  conversations: ConversationPort,
  eventHistory: CopilotkitConversationHistoryTransport,
  owner: { organizationId: string; userId: string },
): Router {
  const runtime = new CopilotRuntime({
    agents: {
      conversation: new GatewayConversationAgUiAgent(conversations, owner),
    },
    runner: new GatewayConversationAgentRunner(conversations, eventHistory, owner),
  });
  return createCopilotExpressHandler({
    runtime,
    basePath: '/api/copilotkit',
    mode: 'single-route',
    cors: false,
    activateChannels: false,
  });
}

/**
 * CopilotKit's SQLite runner owns canonical completed AG-UI event history.
 * Nest remains the owner-fenced authority for live execution and interruption.
 */
export class GatewayConversationAgentRunner extends AgentRunner {
  constructor(
    private readonly conversations: ConversationPort,
    private readonly eventHistory: CopilotkitConversationHistoryTransport,
    private readonly owner: ConversationOwner,
  ) {
    super();
  }

  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    return this.accessible(request.threadId, () => this.eventHistory.run(this.owner, request));
  }

  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return this.accessible(request.threadId, () => this.eventHistory.connect(this.owner, request));
  }

  isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    return this.conversations.isRunning({
      ...this.owner,
      conversationId: request.threadId,
    });
  }

  stop(request: AgentRunnerStopRequest): Promise<boolean> {
    return this.conversations.stop({
      ...this.owner,
      conversationId: request.threadId,
      ...(request.runId === undefined ? {} : { expectedTurnId: request.runId }),
    });
  }

  private accessible(threadId: string, next: () => Observable<BaseEvent>): Observable<BaseEvent> {
    return defer(() => from(this.conversations.assertAccessible({
      ...this.owner,
      conversationId: threadId,
    }))).pipe(mergeMap(next));
  }
}

function invokeExpressHandler(handler: Router, request: Request, response: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      response.off('finish', onFinish);
      response.off('close', onClose);
      if (error) reject(error);
      else resolve();
    };
    const onFinish = () => settle();
    const onClose = () => settle();
    const next: NextFunction = (error?: unknown) => settle(error);

    response.once('finish', onFinish);
    response.once('close', onClose);
    try {
      handler(request, response, next);
    } catch (error) {
      settle(error);
    }
  });
}

interface MapperCoordinates {
  threadId: string;
  runId: string;
  messageId: string;
}

/** A bounded event mapper, not a transcript cache or an AG-UI replay store. */
export class GatewayAgUiEventMapper {
  private textOpen = false;
  private terminal = false;

  constructor(private readonly coordinates: MapperCoordinates) {}

  map(event: ProviderEvent): BaseEvent[] {
    if (this.terminal) return [];
    if (event.kind === 'assistant.delta') {
      const output: BaseEvent[] = [];
      if (!this.textOpen) {
        this.textOpen = true;
        output.push({ type: EventType.TEXT_MESSAGE_START, messageId: this.coordinates.messageId, role: 'assistant' });
      }
      output.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: this.coordinates.messageId, delta: event.delta });
      return output;
    }
    if (event.kind === 'tool.status') {
      return [{
        type: EventType.CUSTOM,
        name: 'kiditem.provider_tool_status',
        value: {
          name: event.name,
          status: event.status,
          ...(event.detail ? { detail: event.detail } : {}),
        },
      }];
    }
    if (event.kind === 'capability.approval_required') {
      return [{
        type: EventType.CUSTOM,
        name: CAPABILITY_APPROVAL_REQUIRED_CUSTOM_EVENT_NAME,
        value: { invocationId: event.invocationId },
      }];
    }
    if (event.status === 'started') return [];
    const output: BaseEvent[] = this.closeText();
    this.terminal = true;
    if (event.status === 'completed') {
      output.push({
        type: EventType.RUN_FINISHED,
        threadId: this.coordinates.threadId,
        runId: this.coordinates.runId,
        outcome: { type: 'success' },
      });
      return output;
    }
    if (event.status === 'interrupted') {
      output.push({
        type: EventType.RUN_FINISHED,
        threadId: this.coordinates.threadId,
        runId: this.coordinates.runId,
        outcome: { type: 'interrupt', interrupts: [] },
      });
      return output;
    }
    output.push({
      type: EventType.RUN_ERROR,
      message: 'The provider turn ended. Send a new message when you are ready.',
    });
    return output;
  }

  get isTerminal(): boolean {
    return this.terminal;
  }

  private closeText(): BaseEvent[] {
    if (!this.textOpen) return [];
    this.textOpen = false;
    return [{ type: EventType.TEXT_MESSAGE_END, messageId: this.coordinates.messageId }];
  }
}

export class GatewayConversationAgUiAgent extends AbstractAgent {
  constructor(
    private readonly conversations: ConversationPort,
    private readonly owner: { organizationId: string; userId: string },
  ) {
    super({ agentId: 'conversation', description: 'Provider-native KidItem conversation' });
  }

  override clone(): GatewayConversationAgUiAgent {
    return new GatewayConversationAgUiAgent(this.conversations, this.owner);
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let terminal = false;
      let unsubscribe: (() => void) | undefined;
      const mapper = new GatewayAgUiEventMapper({
        threadId: input.threadId,
        runId: input.runId,
        messageId: `assistant-${input.runId}`,
      });
      const finish = (): void => {
        if (terminal) return;
        terminal = true;
        const cleanup = unsubscribe;
        unsubscribe = undefined;
        cleanup?.();
        subscriber.complete();
      };
      const emitFailure = (): void => {
        for (const event of mapper.map({ kind: 'status', status: 'failed' })) subscriber.next(event);
        finish();
      };

      subscriber.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
      void this.startGatewayTurn(input).then((turn) => {
        unsubscribe = turn.subscribe((providerEvent) => {
          for (const event of mapper.map(providerEvent)) subscriber.next(event);
          if (mapper.isTerminal) finish();
        });
        if (mapper.isTerminal) {
          const cleanup = unsubscribe;
          unsubscribe = undefined;
          cleanup();
        }
        void turn.ready.catch(() => {
          if (!mapper.isTerminal) emitFailure();
        });
      }).catch(() => {
        emitFailure();
      });

      return () => {
        // Browser/SSE departure detaches only this observer. The provider turn
        // and Nest's exact active-turn authority continue until a real terminal.
      };
    });
  }

  async getCapabilities() {
    return {
      identity: {
        name: 'KidItem conversations',
        type: 'gateway-conversation',
        description: 'Provider-native, owner-fenced KidItem conversations.',
      },
      transport: { streaming: true, resumable: false },
      custom: {
        gatewayReadiness: this.conversations.readiness(),
      },
    };
  }

  private async startGatewayTurn(input: RunAgentInput) {
    const settings = TurnSettingsSchema.safeParse(input.forwardedProps);
    if (!settings.success) throw new Error('conversation_turn_settings_invalid');
    const message = latestUserMessage(input);
    return this.conversations.start({
      ...this.owner,
      conversationId: input.threadId,
      turnId: input.runId,
      message,
      model: settings.data.model,
      reasoningEffort: settings.data.reasoningEffort,
    });
  }
}

function latestUserMessage(input: RunAgentInput): string {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (message.role === 'user' && typeof message.content === 'string') {
      const parsed = ConversationTurnMessageSchema.safeParse(message.content);
      if (parsed.success) return parsed.data;
      if (message.content.trim()) throw new Error('conversation_message_invalid');
    }
  }
  throw new Error('conversation_message_required');
}
