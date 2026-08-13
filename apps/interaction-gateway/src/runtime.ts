import { AsyncLocalStorage } from 'node:async_hooks';

import {
  AgentRunner,
  CopilotSseRuntime,
  createCopilotRuntimeHandler,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
  type AgentsConfig,
} from '@copilotkit/runtime/v2';
import { BaseEventSchema, EventType, type BaseEvent } from '@ag-ui/core';
import {
  AguiConnectionAuthorizationSchema,
  AgentConversationEventEnvelopeSchema,
  InteractionBootstrapSchema,
  type AgentConversationEventEnvelope,
  type AguiRunAuthorization,
} from '@kiditem/shared/agent-interaction';
import {
  EMPTY,
  concat,
  defer,
  finalize,
  from,
  map,
  mergeMap,
  type Observable,
} from 'rxjs';

import { AuthorizedAgentOsHttpAgent } from './authorized-agent-os-http-agent.js';
import type { NestControlPort } from './nest-control-client.js';

const MAX_REPLAY_PAGES = 100;

interface GatewayRequestContext {
  readonly request: Request;
  readonly agentDefinitionKey: string | null;
  readonly replayCursor: string | null;
}

export interface ActiveRunGrant {
  readonly agentDefinitionKey: string;
  readonly threadId: string;
  readonly runId: string;
  readonly authorization: AguiRunAuthorization;
}

export interface InteractionGatewayDependencies {
  readonly control: NestControlPort;
  readonly privateAguiUrl: string;
  readonly serviceSecret: string;
}

export class KidItemAgentRunner extends AgentRunner {
  private readonly active = new Map<string, ActiveRunGrant>();

  constructor(
    private readonly control: NestControlPort,
    private readonly requestContext: AsyncLocalStorage<GatewayRequestContext>,
  ) {
    super();
  }

  run(request: AgentRunnerRunRequest): ReturnType<AgentRunner['run']> {
    const stream = request.agent.run(request.input);
    const wrapped = (stream as unknown as Observable<BaseEvent>).pipe(
      finalize(() => {
        const current = this.active.get(request.threadId);
        if (current?.runId === request.input.runId) {
          this.active.delete(request.threadId);
        }
      }),
    );
    return wrapped as unknown as ReturnType<AgentRunner['run']>;
  }

  connect(
    request: AgentRunnerConnectRequest,
  ): ReturnType<AgentRunner['connect']> {
    const context = this.requireRequestContext();
    const agentDefinitionKey = this.requireAgentDefinitionKey(context);
    const stream = defer(() =>
      this.readReplay({
        request: context.request,
        agentDefinitionKey,
        threadId: request.threadId,
        cursor: context.replayCursor,
      }),
    ).pipe(
      mergeMap(({ replayEvents, liveEvents }) =>
        concat(from(replayEvents), liveEvents),
      ),
    );
    return stream as unknown as ReturnType<AgentRunner['connect']>;
  }

  async isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    const context = this.requireRequestContext();
    const agentDefinitionKey = this.requireAgentDefinitionKey(context);
    const ownership = AguiConnectionAuthorizationSchema.parse(
      await this.control.authorizeConnection(context.request, {
        copilotThreadId: request.threadId,
        cursor: null,
      }),
    );
    const canonical = ownership.currentExecution;
    return Boolean(
      canonical &&
      canonical.agentDefinitionKey === agentDefinitionKey &&
      canonical.copilotThreadId === request.threadId,
    );
  }

  async stop(request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    const context = this.requireRequestContext();
    const agentDefinitionKey = this.requireAgentDefinitionKey(context);
    const ownership = AguiConnectionAuthorizationSchema.parse(
      await this.control.authorizeConnection(context.request, {
        copilotThreadId: request.threadId,
        cursor: null,
      }),
    );
    const canonical = ownership.currentExecution;
    if (
      !canonical ||
      canonical.agentDefinitionKey !== agentDefinitionKey ||
      canonical.copilotThreadId !== request.threadId
    ) {
      return false;
    }

    const stopped = await this.control.stopRun(context.request, {
      agentDefinitionKey: canonical.agentDefinitionKey,
      copilotThreadId: canonical.copilotThreadId,
      aguiRunId: canonical.aguiRunId,
      sessionId: canonical.sessionId,
      executionId: canonical.executionId,
    });
    const selected = this.active.get(request.threadId);
    if (stopped && selected?.authorization.executionId === canonical.executionId) {
      this.active.delete(request.threadId);
    }
    return stopped;
  }

  registerActiveGrant(grant: ActiveRunGrant): void {
    this.active.set(grant.threadId, grant);
  }

  private async readReplay(input: {
    readonly request: Request;
    readonly agentDefinitionKey: string;
    readonly threadId: string;
    readonly cursor: string | null;
  }): Promise<{
    readonly replayEvents: BaseEvent[];
    readonly liveEvents: Observable<BaseEvent>;
  }> {
    let cursor = input.cursor;
    let sessionId: string | null = null;
    let previousSequence: bigint | null = null;
    const seenCursors = new Set<string>();
    const seenEventIds = new Set<string>();
    const replayEvents: BaseEvent[] = [];

    for (let pageNumber = 0; pageNumber < MAX_REPLAY_PAGES; pageNumber += 1) {
      const page = AguiConnectionAuthorizationSchema.parse(
        await this.control.authorizeConnection(input.request, {
          copilotThreadId: input.threadId,
          cursor,
        }),
      );
      if (page.session.copilotThreadId !== input.threadId) {
        throw new Error('Replay authorization returned the wrong thread.');
      }
      sessionId ??= page.session.sessionId;
      if (
        page.session.sessionId !== sessionId ||
        page.replay.sessionId !== sessionId
      ) {
        throw new Error('Replay authorization changed session ownership.');
      }

      for (const rawEvent of page.replay.events) {
        const event = AgentConversationEventEnvelopeSchema.parse(rawEvent);
        if (event.sessionId !== sessionId) {
          throw new Error('Replay event belongs to another session.');
        }
        if (seenEventIds.has(event.eventId)) {
          throw new Error('Replay contains a duplicate event identifier.');
        }
        const sequence = BigInt(event.sequence);
        if (previousSequence === null) {
          if (input.cursor === null && sequence !== 1n) {
            throw new Error('Replay does not begin at the first sequence.');
          }
        } else if (sequence !== previousSequence + 1n) {
          throw new Error('Replay contains a gap or duplicate sequence.');
        }
        seenEventIds.add(event.eventId);
        previousSequence = sequence;
        replayEvents.push(...conversationEnvelopeToAgui(event, input.threadId));
      }

      if (
        page.replay.events.length > 0 &&
        page.replay.lastSequence !== previousSequence?.toString()
      ) {
        throw new Error('Replay last-sequence boundary is inconsistent.');
      }

      if (page.replay.nextCursor !== null) {
        if (seenCursors.has(page.replay.nextCursor)) {
          throw new Error('Replay cursor did not advance.');
        }
        seenCursors.add(page.replay.nextCursor);
        cursor = page.replay.nextCursor;
        continue;
      }

      if (!page.liveJoinToken) {
        throw new Error('Replay completed without a live-join grant.');
      }
      const afterSequence =
        previousSequence?.toString() ?? page.replay.lastSequence;
      const canonical = page.currentExecution;
      const liveEvents = canonical?.agentDefinitionKey === input.agentDefinitionKey
        ? this.control.connectLive(input.request, {
          agentDefinitionKey: input.agentDefinitionKey,
          copilotThreadId: input.threadId,
          afterSequence,
          liveJoinToken: page.liveJoinToken,
        })
        .pipe(
          map((rawEvent) => {
            const event = BaseEventSchema.parse(rawEvent);
            assertLiveCorrelation(event, input.threadId, canonical.aguiRunId);
            return event;
          }),
        )
        : EMPTY;
      return { replayEvents, liveEvents };
    }
    throw new Error('Replay exceeded the bounded page limit.');
  }

  private requireRequestContext(): GatewayRequestContext {
    const context = this.requestContext.getStore();
    if (!context) throw new Error('Gateway request context is unavailable.');
    return context;
  }

  private requireAgentDefinitionKey(context: GatewayRequestContext): string {
    if (!context.agentDefinitionKey) {
      throw new Error('Gateway agent route context is unavailable.');
    }
    return context.agentDefinitionKey;
  }
}

export function createInteractionGateway(
  dependencies: InteractionGatewayDependencies,
) {
  const requestContext = new AsyncLocalStorage<GatewayRequestContext>();
  const runner = new KidItemAgentRunner(dependencies.control, requestContext);
  const dynamicAgents = (async ({ request }: { request: Request }) => {
    const bootstrap = InteractionBootstrapSchema.parse(
      await dependencies.control.bootstrap(request),
    );
    const agents = Object.fromEntries(
      bootstrap.agents.map((allowed) => [
        allowed.agentDefinitionKey,
        new AuthorizedAgentOsHttpAgent({
          request,
          control: dependencies.control,
          agentDefinitionKey: allowed.agentDefinitionKey,
          privateAguiUrl: dependencies.privateAguiUrl,
          serviceSecret: dependencies.serviceSecret,
          onAuthorized: (authorization) => {
            runner.registerActiveGrant({
              agentDefinitionKey: allowed.agentDefinitionKey,
              threadId: authorization.session.copilotThreadId,
              runId: currentRunId(requestContext),
              authorization,
            });
          },
        }),
      ]),
    );
    return agents as Record<string, AuthorizedAgentOsHttpAgent> & {
      readonly operator: AuthorizedAgentOsHttpAgent;
    };
  }) as unknown as AgentsConfig;
  const runtime = new CopilotSseRuntime({
    agents: dynamicAgents,
    runner,
    forwardHeaders: {
      allow: ['cookie'],
      deny: ['authorization'],
      denyPrefixes: ['x-'],
    },
  });
  const nativeHandler = createCopilotRuntimeHandler({
    runtime,
    basePath: '/api/copilotkit',
    activateChannels: false,
  });
  const handler = async (request: Request): Promise<Response> => {
    const context = await gatewayRequestContext(request);
    return requestContext.run(context, () => nativeHandler(context.request));
  };
  return { runtime, runner, handler };
}

function currentRunId(
  requestContext: AsyncLocalStorage<GatewayRequestContext>,
): string {
  const context = requestContext.getStore();
  const runId = context?.request.headers.get('x-kiditem-current-run-id');
  if (!runId) {
    throw new Error('Gateway run correlation is unavailable.');
  }
  return runId;
}

async function gatewayRequestContext(
  request: Request,
): Promise<GatewayRequestContext> {
  const path = new URL(request.url).pathname;
  const match = /\/agent\/([^/]+)\/(?:run|connect|stop\/[^/]+)$/.exec(path);
  const agentDefinitionKey = match?.[1] ? decodeURIComponent(match[1]) : null;
  let replayCursor: string | null = null;
  let runId: string | null = null;
  if (request.method === 'POST' && /\/(?:run|connect)$/.test(path)) {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body === 'object') {
      const candidate = body as Record<string, unknown>;
      if (typeof candidate.runId === 'string') runId = candidate.runId;
      const props = candidate.forwardedProps;
      if (props && typeof props === 'object') {
        const cursor = (props as Record<string, unknown>).kiditemReplayCursor;
        if (cursor === null || typeof cursor === 'string')
          replayCursor = cursor;
      }
    }
  }
  const headers = new Headers(request.headers);
  if (runId) headers.set('x-kiditem-current-run-id', runId);
  const contextualRequest = new Request(request, { headers });
  return { request: contextualRequest, agentDefinitionKey, replayCursor };
}

function assertLiveCorrelation(
  event: BaseEvent,
  threadId: string,
  runId: string | undefined,
): void {
  const candidate = event as BaseEvent & { threadId?: string; runId?: string };
  if (candidate.threadId !== undefined && candidate.threadId !== threadId) {
    throw new Error('Live event belongs to another thread.');
  }
  if (runId && candidate.runId !== undefined && candidate.runId !== runId) {
    throw new Error('Live event belongs to another run.');
  }
}

function conversationEnvelopeToAgui(
  event: AgentConversationEventEnvelope,
  threadId: string,
): BaseEvent[] {
  const rawEvent = {
    kiditemEventId: event.eventId,
    kiditemSessionId: event.sessionId,
    kiditemExecutionId: event.executionId,
    kiditemSequence: event.sequence,
    schemaVersion: event.schemaVersion,
  };
  switch (event.eventType) {
    case 'user_message':
    case 'assistant_message': {
      const role = event.eventType === 'user_message' ? 'user' : 'assistant';
      const phase = 'phase' in event.payload ? event.payload.phase : 'complete';
      if (phase === 'start') {
        return [{ type: EventType.TEXT_MESSAGE_START, messageId: event.payload.messageId, role, rawEvent }];
      }
      if (phase === 'delta') {
        if (!('content' in event.payload)) throw new Error('Invalid canonical message delta.');
        return [{ type: EventType.TEXT_MESSAGE_CONTENT, messageId: event.payload.messageId, delta: event.payload.content, rawEvent }];
      }
      if (phase === 'end') {
        return [{ type: EventType.TEXT_MESSAGE_END, messageId: event.payload.messageId, rawEvent }];
      }
      if (!('content' in event.payload)) throw new Error('Invalid canonical complete message.');
      return [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: event.payload.messageId,
          role,
          rawEvent,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: event.payload.messageId,
          delta: event.payload.content,
          rawEvent,
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: event.payload.messageId,
          rawEvent,
        },
      ];
    }
    case 'state_snapshot':
      if (
        event.payload.snapshotType === 'tool_result' &&
        'result' in event.payload.data
      ) {
        return [{
          type: EventType.TOOL_CALL_RESULT,
          messageId: event.payload.data.messageId,
          toolCallId: event.payload.data.toolCallId,
          content: JSON.stringify(event.payload.data.result),
          role: 'tool',
          rawEvent,
        }];
      }
      return [
        {
          type: EventType.STATE_SNAPSHOT,
          snapshot: {
            snapshotType: event.payload.snapshotType,
            snapshotVersion: event.payload.snapshotVersion,
            data: event.payload.data,
          },
          rawEvent,
        },
      ];
    case 'run_terminal':
      if (event.payload.status === 'failed') {
        return [
          {
            type: EventType.RUN_ERROR,
            message: 'The KidItem agent run failed.',
            code: event.payload.errorCode ?? 'agent_run_failed',
            rawEvent,
          },
        ];
      }
      return [
        {
          type: EventType.RUN_FINISHED,
          threadId,
          runId: event.executionId ?? event.eventId,
          result: { status: event.payload.status },
          rawEvent,
        },
      ];
    case 'system_notice':
    case 'tool_activity':
    case 'hitl_request':
    case 'hitl_decision':
      return [
        {
          type: EventType.CUSTOM,
          name: `kiditem.${event.eventType}`,
          value: event.payload,
          rawEvent,
        },
      ];
  }
}
