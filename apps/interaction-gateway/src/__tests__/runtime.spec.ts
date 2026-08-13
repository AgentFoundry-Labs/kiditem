import { HttpAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import { lastValueFrom, of, toArray } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizedAgentOsHttpAgent } from '../authorized-agent-os-http-agent.js';
import {
  GatewayControlError,
  NestControlClient,
  type NestControlPort,
} from '../nest-control-client.js';
import {
  createInteractionGateway,
  type InteractionGatewayDependencies,
} from '../runtime.js';
import { checkGatewayReadiness } from '../server.js';

const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';
const COOKIE = 'kiditem_session=opaque';

const dashboardContext = {
  routeKey: 'global',
  resourceRefs: [],
  filters: {},
  visibleRowIds: [],
  aggregateSummary: {},
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
};

const runInput = (overrides: Partial<RunAgentInput> = {}): RunAgentInput => ({
  threadId: THREAD_ID,
  runId: RUN_ID,
  state: { kiditemDashboardContext: dashboardContext },
  messages: [{ id: 'message-1', role: 'user', content: '재고를 확인해줘' }],
  tools: [],
  context: [],
  forwardedProps: {
    authorization: 'attacker',
    organizationId: 'attacker-org',
    modelIdentity: 'attacker-model',
    harmlessButUnapproved: 'drop-me',
  },
  ...overrides,
});

const bootstrap = {
  defaultAgentDefinitionKey: 'operator',
  agents: [
    {
      agentDefinitionKey: 'operator',
      agentVersionId: 'version-1',
      displayName: 'Operator',
      description: 'KidItem Operator',
      isDefault: true,
    },
  ],
  sessions: [],
};

const intent = {
  runIntent: 'i'.repeat(64),
  expiresAt: '2026-08-14T00:00:30.000Z',
  copilotThreadId: THREAD_ID,
  aguiRunId: RUN_ID,
};

const session = {
  sessionId: 'session-1',
  copilotThreadId: THREAD_ID,
  primaryAgentDefinitionKey: 'operator',
  primaryAgentVersionId: 'version-1',
  lifecycle: 'active' as const,
  updatedAt: '2026-08-14T00:00:00.000Z',
};

const authorization = {
  session,
  sessionTaskId: 'task-1',
  executionId: 'execution-1',
  modelIdentity: 'model-1',
  runtimeType: 'runtime-1',
  policySnapshotId: 'policy-1',
  contextEpoch: 1,
  dashboardContext,
};

const envelope = (
  sequence: number,
  overrides: Record<string, unknown> = {},
) => ({
  eventId: `event-${sequence}`,
  sessionId: 'session-1',
  executionId: 'execution-1',
  sequence: String(sequence),
  createdAt: `2026-08-14T00:00:0${Math.min(sequence, 9)}.000Z`,
  eventType: 'assistant_message' as const,
  schemaVersion: 1 as const,
  payload: { messageId: `message-${sequence}`, content: `event ${sequence}` },
  ...overrides,
});

function connectionAuthorization(
  events = [envelope(1)],
  nextCursor: string | null = null,
) {
  return {
    session,
    contextEpoch: 1,
    replay: {
      sessionId: session.sessionId,
      events,
      nextCursor,
      lastSequence: events.at(-1)?.sequence ?? '0',
    },
    liveJoinToken: nextCursor === null ? 'j'.repeat(64) : null,
    liveJoinExpiresAt: nextCursor === null ? '2026-08-14T00:00:15.000Z' : null,
  };
}

function controlHarness(): NestControlPort &
  Record<string, ReturnType<typeof vi.fn>> {
  return {
    bootstrap: vi.fn().mockResolvedValue(bootstrap),
    prepareRunIntent: vi.fn().mockResolvedValue(intent),
    authorizeRun: vi.fn().mockResolvedValue(authorization),
    authorizeConnection: vi.fn().mockResolvedValue(connectionAuthorization()),
    connectLive: vi.fn().mockReturnValue(of()),
    stopRun: vi.fn().mockResolvedValue(true),
    checkInteractionHealth: vi.fn().mockResolvedValue(undefined),
    checkPrivateAguiHealth: vi.fn().mockResolvedValue(undefined),
  };
}

function request(headers: Record<string, string> = {}) {
  return new Request('http://gateway.test/api/copilotkit/info', {
    headers: { cookie: COOKIE, ...headers },
  });
}

function dependencies(
  control = controlHarness(),
): InteractionGatewayDependencies {
  return {
    control,
    privateAguiUrl: 'http://api:4000/api/agent-os/ag-ui',
    serviceSecret: 's'.repeat(32),
  };
}

async function readSseEvents(response: Response): Promise<BaseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += typeof value === 'string' ? value : decoder.decode(value);
  }
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as BaseEvent);
}

describe('AuthorizedAgentOsHttpAgent', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prepares intent, authorizes, then dispatches with rebuilt authority props', async () => {
    const control = controlHarness();
    const calls: string[] = [];
    control.prepareRunIntent.mockImplementation(async () => {
      calls.push('intent');
      return intent;
    });
    control.authorizeRun.mockImplementation(async () => {
      calls.push('authorize');
      return authorization;
    });
    vi.spyOn(HttpAgent.prototype, 'run').mockImplementation((input) => {
      calls.push('dispatch');
      expect(input.forwardedProps).toEqual({
        kiditemAuthorization: authorization,
      });
      return of({
        type: EventType.RUN_FINISHED,
        threadId: THREAD_ID,
        runId: RUN_ID,
      });
    });

    const agent = new AuthorizedAgentOsHttpAgent({
      request: request({
        authorization: 'Bearer attacker',
        'x-organization-id': 'attacker-org',
        'x-attacker': 'attacker',
      }),
      control,
      agentDefinitionKey: 'operator',
      privateAguiUrl: 'http://api:4000/api/agent-os/ag-ui',
      serviceSecret: 's'.repeat(32),
    });

    await lastValueFrom(agent.run(runInput()));
    expect(calls).toEqual(['intent', 'authorize', 'dispatch']);
    expect(control.prepareRunIntent).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        agentDefinitionKey: 'operator',
        userEvent: {
          externalEventId: 'message-1',
          schemaVersion: 1,
          payload: { messageId: 'message-1', content: '재고를 확인해줘' },
        },
      }),
    );
  });

  it.each(['intent', 'authorization'])(
    'never dispatches after %s failure',
    async (failure) => {
      const control = controlHarness();
      if (failure === 'intent') {
        control.prepareRunIntent.mockRejectedValue(new Error('denied'));
      } else {
        control.authorizeRun.mockRejectedValue(new Error('denied'));
      }
      const dispatch = vi.spyOn(HttpAgent.prototype, 'run');
      const agent = new AuthorizedAgentOsHttpAgent({
        request: request(),
        control,
        agentDefinitionKey: 'operator',
        privateAguiUrl: 'http://api:4000/api/agent-os/ag-ui',
        serviceSecret: 's'.repeat(32),
      });

      await expect(lastValueFrom(agent.run(runInput()))).rejects.toThrow(
        'denied',
      );
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
});

describe('CopilotKit native runtime routes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('projects only server-authorized agents from native GET /info', async () => {
    const control = controlHarness();
    const gateway = createInteractionGateway(dependencies(control));
    const response = await gateway.handler(
      new Request('http://gateway.test/api/copilotkit/info', {
        headers: { cookie: COOKIE },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.agents)).toEqual(['operator']);
    expect(body.mode).toBe('sse');
    expect(body).not.toHaveProperty('intelligence');
    expect(gateway.runtime.identifyUser).toBeUndefined();
  });

  it('uses native run while keeping authorization ahead of private dispatch', async () => {
    const control = controlHarness();
    const calls: string[] = [];
    control.prepareRunIntent.mockImplementation(async () => {
      calls.push('intent');
      return intent;
    });
    control.authorizeRun.mockImplementation(async () => {
      calls.push('authorize');
      return authorization;
    });
    vi.spyOn(HttpAgent.prototype, 'run').mockImplementation(function () {
      calls.push('dispatch');
      expect(this.headers).toEqual({
        'x-kiditem-interaction-gateway': 's'.repeat(32),
      });
      return of({
        type: EventType.RUN_FINISHED,
        threadId: THREAD_ID,
        runId: RUN_ID,
      });
    });
    const gateway = createInteractionGateway(dependencies(control));
    const response = await gateway.handler(
      new Request('http://gateway.test/api/copilotkit/agent/operator/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: COOKIE,
          authorization: 'Bearer attacker',
          'x-organization-id': 'attacker-org',
        },
        body: JSON.stringify(runInput()),
      }),
    );

    expect((await readSseEvents(response)).at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      threadId: THREAD_ID,
      runId: RUN_ID,
    });
    expect(calls).toEqual(['intent', 'authorize', 'dispatch']);
  });

  it('uses native connect for paginated read-only replay and final live join', async () => {
    const control = controlHarness();
    const nextCursor = 'cursor-next-page-0001';
    control.authorizeConnection
      .mockResolvedValueOnce(connectionAuthorization([envelope(4)], nextCursor))
      .mockResolvedValueOnce(connectionAuthorization([envelope(5)]));
    control.connectLive.mockReturnValue(
      of({ type: EventType.CUSTOM, name: 'kiditem.live', value: 'joined' }),
    );
    const gateway = createInteractionGateway(dependencies(control));
    gateway.runner.registerActiveGrant({
      agentDefinitionKey: 'operator', threadId: THREAD_ID, runId: RUN_ID, authorization,
    });
    const response = await gateway.handler(
      new Request('http://gateway.test/api/copilotkit/agent/operator/connect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: COOKIE,
          authorization: 'Bearer attacker',
          'x-organization-id': 'attacker-org',
          'x-attacker': 'attacker',
        },
        body: JSON.stringify({
          ...runInput({ messages: [] }),
          forwardedProps: { kiditemReplayCursor: 'cursor-start-page-01' },
        }),
      }),
    );
    const events = await readSseEvents(response);

    expect(response.status).toBe(200);
    expect(
      events.filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toHaveLength(2);
    expect(control.authorizeConnection).toHaveBeenCalledTimes(2);
    expect(control.prepareRunIntent).not.toHaveBeenCalled();
    expect(control.authorizeRun).not.toHaveBeenCalled();
    expect(control.connectLive).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        agentDefinitionKey: 'operator',
        copilotThreadId: THREAD_ID,
        afterSequence: '5',
        liveJoinToken: 'j'.repeat(64),
      }),
    );
  });

  it('completes terminal replay without holding a live stream that blocks a later run', async () => {
    const control = controlHarness();
    const gateway = createInteractionGateway(dependencies(control));
    const response = await gateway.handler(
      new Request('http://gateway.test/api/copilotkit/agent/operator/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: COOKIE },
        body: JSON.stringify(runInput({ messages: [] })),
      }),
    );

    const events = await readSseEvents(response);

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: 'event 1',
    }));
    expect(control.connectLive).not.toHaveBeenCalled();
  });

  it.each([
    ['gap', [envelope(1), envelope(3)]],
    ['duplicate', [envelope(1), envelope(1, { eventId: 'event-other' })]],
    ['wrong session', [envelope(1, { sessionId: 'session-other' })]],
    ['unknown version', [envelope(1, { schemaVersion: 2 })]],
  ])('rejects %s replay before live join', async (_name, events) => {
    const control = controlHarness();
    control.authorizeConnection.mockResolvedValue(
      connectionAuthorization(events as ReturnType<typeof envelope>[]),
    );
    const gateway = createInteractionGateway(dependencies(control));
    const response = await gateway.handler(
      new Request('http://gateway.test/api/copilotkit/agent/operator/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: COOKIE },
        body: JSON.stringify(runInput({ messages: [] })),
      }),
    );
    await response.text();

    expect(control.connectLive).not.toHaveBeenCalled();
  });

  it('native stop re-authorizes ownership and targets the exact active grant', async () => {
    const control = controlHarness();
    const gateway = createInteractionGateway(dependencies(control));
    gateway.runner.registerActiveGrant({
      agentDefinitionKey: 'operator',
      threadId: THREAD_ID,
      runId: RUN_ID,
      authorization,
    });

    const response = await gateway.handler(
      new Request(
        `http://gateway.test/api/copilotkit/agent/operator/stop/${THREAD_ID}`,
        { method: 'POST', headers: { cookie: COOKIE } },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stopped: true });
    expect(control.authorizeConnection).toHaveBeenCalledOnce();
    expect(control.stopRun).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        agentDefinitionKey: 'operator',
        copilotThreadId: THREAD_ID,
        aguiRunId: RUN_ID,
        executionId: 'execution-1',
        sessionId: 'session-1',
      }),
    );
  });

  it('does not let an older stop authorization cancel a newer run', async () => {
    const control = controlHarness();
    const gateway = createInteractionGateway(dependencies(control));
    gateway.runner.registerActiveGrant({
      agentDefinitionKey: 'operator',
      threadId: THREAD_ID,
      runId: RUN_ID,
      authorization,
    });
    control.authorizeConnection.mockImplementationOnce(async () => {
      gateway.runner.registerActiveGrant({
        agentDefinitionKey: 'operator',
        threadId: THREAD_ID,
        runId: 'run-2',
        authorization: { ...authorization, executionId: 'execution-2' },
      });
      return connectionAuthorization();
    });

    const response = await gateway.handler(
      new Request(
        `http://gateway.test/api/copilotkit/agent/operator/stop/${THREAD_ID}`,
        { method: 'POST', headers: { cookie: COOKIE } },
      ),
    );

    expect(await response.json()).toMatchObject({ stopped: false });
    expect(control.stopRun).not.toHaveBeenCalled();
  });

  it('denies cross-user stop when ownership authorization fails', async () => {
    const control = controlHarness();
    const gateway = createInteractionGateway(dependencies(control));
    gateway.runner.registerActiveGrant({
      agentDefinitionKey: 'operator',
      threadId: THREAD_ID,
      runId: RUN_ID,
      authorization,
    });
    control.authorizeConnection.mockRejectedValueOnce(
      new GatewayControlError(403, 'interaction_connection_forbidden'),
    );

    const response = await gateway.handler(
      new Request(
        `http://gateway.test/api/copilotkit/agent/operator/stop/${THREAD_ID}`,
        { method: 'POST', headers: { cookie: 'kiditem_session=attacker' } },
      ),
    );

    expect(response.status).toBe(500);
    expect(control.stopRun).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('kiditem_session');
  });
});

describe('NestControlClient header boundary', () => {
  it('forwards only cookie to browser calls and server secret to private calls', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/runs/intent')) return Response.json(intent);
      if (url.endsWith('/runs/authorize')) return Response.json(authorization);
      return Response.json(connectionAuthorization());
    });
    const client = new NestControlClient({
      kidItemApiInternalUrl: 'http://api:4000',
      privateAguiUrl: 'http://api:4000/api/agent-os/ag-ui',
      serviceSecret: 's'.repeat(32),
      fetch,
    });
    const attackerRequest = request({
      authorization: 'Bearer attacker',
      'x-organization-id': 'attacker-org',
      'x-attacker': 'attacker',
    });
    const userEvent = {
      externalEventId: 'message-1',
      schemaVersion: 1 as const,
      payload: { messageId: 'message-1', content: '재고를 확인해줘' },
    };

    await client.prepareRunIntent(attackerRequest, {
      agentDefinitionKey: 'operator',
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      dashboardContext,
      userEvent,
    });
    await client.authorizeRun({
      runIntent: intent.runIntent,
      copilotThreadId: THREAD_ID,
      aguiRunId: RUN_ID,
      dashboardContext,
      userEvent,
    });
    await client.authorizeConnection(attackerRequest, {
      copilotThreadId: THREAD_ID,
      cursor: null,
    });

    expect(fetch.mock.calls[0][1].headers).toEqual({
      'content-type': 'application/json',
      cookie: COOKIE,
    });
    expect(fetch.mock.calls[1][1].headers).toEqual({
      'content-type': 'application/json',
      'x-kiditem-interaction-gateway': 's'.repeat(32),
    });
    expect(fetch.mock.calls[2][1].headers).toEqual({
      'content-type': 'application/json',
      cookie: COOKIE,
      'x-kiditem-interaction-gateway': 's'.repeat(32),
    });
  });

  it('reports stable status/code without reflecting response secrets', async () => {
    const client = new NestControlClient({
      kidItemApiInternalUrl: 'http://api:4000',
      privateAguiUrl: 'http://api:4000/api/agent-os/ag-ui',
      serviceSecret: 's'.repeat(32),
      fetch: vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'access_denied', message: 'secret-token-value' },
            { status: 403 },
          ),
        ),
    });

    const error = await client.bootstrap(request()).catch((caught) => caught);
    expect(error).toBeInstanceOf(GatewayControlError);
    expect(error).toMatchObject({ status: 403, code: 'access_denied' });
    expect(String(error)).not.toContain('secret-token-value');
  });
});

describe('gateway health', () => {
  it('fails readiness closed when either private dependency is unavailable', async () => {
    const control = controlHarness();
    await expect(checkGatewayReadiness(control)).resolves.toEqual({
      status: 'ok',
    });

    control.checkPrivateAguiHealth.mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await expect(checkGatewayReadiness(control)).rejects.toThrow('unavailable');

    control.checkInteractionHealth.mockRejectedValueOnce(
      new Error('control unavailable'),
    );
    await expect(checkGatewayReadiness(control)).rejects.toThrow(
      'control unavailable',
    );
  });
});
