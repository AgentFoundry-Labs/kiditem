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
  AgentConversationConnectionAuthorizationSchema,
  AgentConversationEventEnvelopeSchema,
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
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
import { GatewayControlError, type NestControlPort } from './nest-control-client.js';

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
    const stream = defer(async () => {
      try {
        return await this.readReplay({
          request: context.request,
          agentDefinitionKey,
          threadId: request.threadId,
          cursor: context.replayCursor,
        });
      } catch (error) {
        // CopilotKit connects before a browser-created UUID has its first
        // authorized run. The control endpoint remains fail-closed; the
        // public gateway exposes no existence signal or replay data yet.
        if (isFreshThreadConnectionDenial(error)) {
          return { replayEvents: [], liveEvents: EMPTY };
        }
        throw error;
      }
    }).pipe(
      mergeMap(({ replayEvents, liveEvents }) =>
        concat(from(replayEvents), liveEvents),
      ),
    );
    return stream as unknown as ReturnType<AgentRunner['connect']>;
  }

  async isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    const context = this.requireRequestContext();
    const agentDefinitionKey = this.requireAgentDefinitionKey(context);
    const active = await this.control.authorizeActiveRun(context.request, {
      agentDefinitionKey,
      copilotThreadId: request.threadId,
    });
    return active !== null;
  }

  async stop(request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    const context = this.requireRequestContext();
    const agentDefinitionKey = this.requireAgentDefinitionKey(context);
    const active = await this.control.authorizeActiveRun(context.request, {
      agentDefinitionKey,
      copilotThreadId: request.threadId,
    });
    if (!active) return false;

    const stopped = await this.control.stopRun(context.request, {
      agentDefinitionKey,
      copilotThreadId: request.threadId,
      aguiRunId: active.aguiRunId,
      session: active.session,
      execution: active.execution,
    });
    const selected = this.active.get(request.threadId);
    if (stopped && selected?.authorization.execution === active.execution) {
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
    let session: string | null = null;
    let previousSequence: bigint | null = null;
    const seenCursors = new Set<string>();
    const seenEventIds = new Set<string>();
    const canonicalEvents: AgentConversationEventEnvelope[] = [];

    for (let pageNumber = 0; pageNumber < MAX_REPLAY_PAGES; pageNumber += 1) {
      const connection = AgentConversationConnectionAuthorizationSchema.parse(
        await this.control.authorizeConnection(input.request, {
          copilotThreadId: input.threadId,
          cursor,
        }),
      );
      const page = connection.replay;
      if (connection.authorization.session !== page.session) {
        throw new Error('Replay authorization changed session ownership.');
      }
      if (
        connection.authorization.replay.nextCursor !== page.nextCursor ||
        connection.authorization.replay.lastSequence !== page.lastSequence
      ) {
        throw new Error('Replay authorization metadata is inconsistent.');
      }
      session ??= page.session;
      if (
        page.session !== session
      ) {
        throw new Error('Replay authorization changed session ownership.');
      }

      for (const rawEvent of page.events) {
        const event = AgentConversationEventEnvelopeSchema.parse(rawEvent);
        if (event.session !== session) {
          throw new Error('Replay event belongs to another session.');
        }
        if (seenEventIds.has(event.name)) {
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
        seenEventIds.add(event.name);
        previousSequence = sequence;
        canonicalEvents.push(event);
      }

      if (
        page.events.length > 0 &&
        page.lastSequence !== previousSequence?.toString()
      ) {
        throw new Error('Replay last-sequence boundary is inconsistent.');
      }

      if (page.nextCursor !== null) {
        if (seenCursors.has(page.nextCursor)) {
          throw new Error('Replay cursor did not advance.');
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
        continue;
      }

      const projected = projectCanonicalReplay(
        canonicalEvents,
        input.threadId,
      );
      if (projected.terminates) {
        return { replayEvents: projected.events, liveEvents: EMPTY };
      }
      if (!connection.liveJoinToken) {
        throw new Error('Replay completed without a live-join grant.');
      }
      const afterSequence =
        previousSequence?.toString() ?? page.lastSequence;
      const liveEvents = this.control.connectLive(input.request, {
          agentDefinitionKey: input.agentDefinitionKey,
          copilotThreadId: input.threadId,
          afterSequence,
          liveJoinToken: connection.liveJoinToken,
        })
        .pipe(
          map((rawEvent) => {
            const event = BaseEventSchema.parse(rawEvent);
            assertLiveCorrelation(event, input.threadId);
            return event;
          }),
        );
      return { replayEvents: projected.events, liveEvents };
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

function projectCanonicalReplay(
  events: readonly AgentConversationEventEnvelope[],
  threadId: string,
): { readonly events: BaseEvent[]; readonly terminates: boolean } {
  const decisionSequences = new Map<string, bigint>();
  for (const event of events) {
    if (event.eventType === 'hitl_decision') {
      decisionSequences.set(event.payload.requestId, BigInt(event.sequence));
    }
  }

  let openReplayRunId: string | null = null;
  let replayTailTerminates = false;
  const replayEvents: BaseEvent[] = [];
  for (const event of events) {
    const decisionSequence = event.eventType === 'hitl_request' && event.payload.approval
      ? decisionSequences.get(event.payload.requestId)
      : undefined;
    // A decision is canonical durable state. Do not revive an interrupt that
    // has already been resolved by a later browser/device session.
    if (decisionSequence !== undefined && decisionSequence > BigInt(event.sequence)) {
      continue;
    }
    if (openReplayRunId === null && event.aguiRunId) {
      replayEvents.push(replayRunStarted(event, threadId));
      openReplayRunId = event.aguiRunId;
    }
    replayEvents.push(...conversationEnvelopeToAgui(
      event,
      threadId,
      openReplayRunId ?? event.aguiRunId,
    ));
    const interrupt = event.eventType === 'hitl_request' &&
      event.payload.approval !== undefined;
    // A standard AG-UI interrupt terminates the visible run. The durable
    // parent can finish only after the decision and will replay on reconnect.
    if (interrupt) return { events: replayEvents, terminates: true };
    replayTailTerminates = event.eventType === 'run_terminal';
    if (replayTailTerminates) openReplayRunId = null;
  }
  return { events: replayEvents, terminates: replayTailTerminates };
}

function isFreshThreadConnectionDenial(error: unknown): boolean {
  return error instanceof GatewayControlError &&
    error.status === 403 &&
    error.code === 'INTERACTION_CONNECTION_NOT_AUTHORIZED';
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
          onAuthorized: (authorization, correlation) => {
            runner.registerActiveGrant({
              agentDefinitionKey: allowed.agentDefinitionKey,
              threadId: correlation.copilotThreadId,
              runId: correlation.aguiRunId,
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

async function gatewayRequestContext(
  request: Request,
): Promise<GatewayRequestContext> {
  const path = new URL(request.url).pathname;
  const match = /\/agent\/([^/]+)\/(?:run|connect|stop\/[^/]+)$/.exec(path);
  const agentDefinitionKey = match?.[1] ? decodeURIComponent(match[1]) : null;
  let replayCursor: string | null = null;
  if (request.method === 'POST' && /\/(?:run|connect)$/.test(path)) {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body === 'object') {
      const candidate = body as Record<string, unknown>;
      const props = candidate.forwardedProps;
      if (props && typeof props === 'object') {
        const cursor = (props as Record<string, unknown>).kiditemReplayCursor;
        if (cursor === null || typeof cursor === 'string')
          replayCursor = cursor;
      }
    }
  }
  return { request, agentDefinitionKey, replayCursor };
}

function assertLiveCorrelation(
  event: BaseEvent,
  threadId: string,
): void {
  const candidate = event as BaseEvent & { threadId?: string; runId?: string };
  if (candidate.threadId !== undefined && candidate.threadId !== threadId) {
    throw new Error('Live event belongs to another thread.');
  }
}

function conversationEnvelopeToAgui(
  event: AgentConversationEventEnvelope,
  threadId: string,
  protocolRunId: string | null = event.aguiRunId,
): BaseEvent[] {
  const rawEvent = {
    kiditemEvent: event.name,
    kiditemSession: event.session,
    kiditemExecution: event.execution,
    kiditemAguiRunId: event.aguiRunId,
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
    case 'state_snapshot': {
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
      const activity = durableActivitySnapshot(event, rawEvent);
      if (activity) return [activity];
      if (event.payload.snapshotType === 'agent_approval') return [];
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
    }
    case 'run_terminal':
      if (!protocolRunId) {
        throw new Error('Canonical terminal event has no AG-UI run correlation.');
      }
      if (event.payload.status === 'failed') {
        return [
          {
            type: EventType.RUN_ERROR,
            message: 'The KidItem agent run failed.',
            code: event.payload.errorCode ?? 'agent_run_failed',
            threadId,
            runId: protocolRunId,
            rawEvent,
          } as BaseEvent,
        ];
      }
      if (event.payload.status === 'cancelled') {
        return [
          {
            type: EventType.RUN_ERROR,
            message: 'The KidItem agent run was cancelled.',
            code: event.payload.errorCode ?? 'agent_run_cancelled',
            threadId,
            runId: protocolRunId,
            rawEvent,
          } as BaseEvent,
        ];
      }
      return [
        {
          type: EventType.RUN_FINISHED,
          threadId,
          runId: protocolRunId,
          result: { status: event.payload.status },
          rawEvent,
        },
      ];
    case 'hitl_request':
      if (event.payload.approval) {
        if (!protocolRunId) {
          throw new Error('Canonical approval interrupt has no AG-UI run correlation.');
        }
        return [
          {
            type: EventType.RUN_FINISHED,
            threadId,
            runId: protocolRunId,
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: event.payload.requestId,
                  reason: 'kiditem_agent_approval_required',
                  message: event.payload.prompt,
                  expiresAt: event.payload.approval.expiresAt,
                  metadata: { approval: event.payload.approval },
                },
              ],
            },
            rawEvent,
          } as BaseEvent,
        ];
      }
      return [
        {
          type: EventType.CUSTOM,
          name: 'kiditem.hitl_request',
          value: event.payload,
          rawEvent,
        },
      ];
    case 'system_notice':
      if (event.payload.code === 'agui.run_started') return [];
      return [
        {
          type: EventType.CUSTOM,
          name: `kiditem.${event.eventType}`,
          value: event.payload,
          rawEvent,
        },
      ];
    case 'tool_activity':
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

function replayRunStarted(
  event: AgentConversationEventEnvelope,
  threadId: string,
): BaseEvent {
  if (!event.aguiRunId) {
    throw new Error('Canonical execution event has no AG-UI run correlation.');
  }
  return {
    type: EventType.RUN_STARTED,
    threadId,
    runId: event.aguiRunId,
    rawEvent: {
      kiditemEvent: event.name,
      kiditemSession: event.session,
      kiditemExecution: event.execution,
      kiditemAguiRunId: event.aguiRunId,
      kiditemSequence: event.sequence,
      schemaVersion: event.schemaVersion,
    },
  } as BaseEvent;
}

function durableActivitySnapshot(
  event: Extract<AgentConversationEventEnvelope, { eventType: 'state_snapshot' }>,
  rawEvent: Record<string, unknown>,
): BaseEvent | null {
  switch (event.payload.snapshotType) {
    case 'agent_progress': {
      const data = AgentProgressEventSchema.parse(event.payload.data);
      return {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: `kiditem:agent-progress:${event.execution ?? event.name}`,
        activityType: data.name,
        content: data,
        replace: true,
        rawEvent,
      } as BaseEvent;
    }
    case 'agent_artifact': {
      const data = AgentArtifactCardSchema.parse(event.payload.data);
      return {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: `kiditem:agent-artifact:${data.artifactId}`,
        activityType: data.name,
        content: data,
        replace: true,
        rawEvent,
      } as BaseEvent;
    }
    case 'agent_delegation': {
      const data = AgentDelegationEventSchema.parse(event.payload.data);
      return {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: `kiditem:agent-delegation:${data.childTask}`,
        activityType: data.name,
        content: data,
        replace: true,
        rawEvent,
      } as BaseEvent;
    }
    default:
      return null;
  }
}
