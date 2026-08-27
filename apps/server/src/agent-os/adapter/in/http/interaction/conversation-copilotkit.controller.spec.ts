import type { INestApplication } from '@nestjs/common';
import type { BaseEvent } from '@ag-ui/client';
import type {
  AgentRunnerConnectRequest,
  AgentRunnerRunRequest,
} from '@copilotkit/runtime/v2';
import { readFile } from 'node:fs/promises';
import {
  CONVERSATION_PORT,
  type ConversationOwner,
} from '../../../../application/port/in/capability/conversation.port';
import { ConversationService } from '../../../../application/service/conversation.service';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { firstValueFrom, Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConversationCopilotkitController,
  GatewayConversationAgentRunner,
  GatewayConversationAgUiAgent,
  GatewayAgUiEventMapper,
} from './conversation-copilotkit.controller';
import {
  COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT,
  type CopilotkitConversationHistoryTransport,
} from './copilotkit-conversation-history.transport';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';

let app: INestApplication | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

/**
 * Incoming-controller harness only. It proves the HTTP runner's owner-scoped
 * run/connect contract with completed events in memory; SQLite namespace,
 * restart, and physical replay behavior belong to the outgoing adapter specs.
 */
class TestConversationHistoryTransport implements CopilotkitConversationHistoryTransport {
  private readonly completed = new Map<string, BaseEvent[]>();

  run(owner: ConversationOwner, request: AgentRunnerRunRequest): Observable<BaseEvent> {
    const key = historyKey(owner, request.threadId);
    return new Observable<BaseEvent>((subscriber) => {
      const events: BaseEvent[] = [];
      const subscription = request.agent.run(request.input).subscribe({
        next: (event) => {
          events.push(event);
          subscriber.next(event);
        },
        error: (error: unknown) => subscriber.error(error),
        complete: () => {
          this.completed.set(key, events);
          subscriber.complete();
        },
      });
      return () => subscription.unsubscribe();
    });
  }

  connect(owner: ConversationOwner, request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return of(...(this.completed.get(historyKey(owner, request.threadId)) ?? []));
  }
}

function createHistoryTransport(): CopilotkitConversationHistoryTransport {
  return new TestConversationHistoryTransport();
}

function historyKey(owner: ConversationOwner, conversationId: string): string {
  return JSON.stringify([owner.organizationId, conversationId]);
}

describe('GatewayAgUiEventMapper', () => {
  it('keeps the controller spec on its incoming history transport seam', async () => {
    const source = await readFile(new URL('./conversation-copilotkit.controller.spec.ts', import.meta.url), 'utf8');
    const imports = source.split(/\r?\n/).filter((line) => line.startsWith('import')).join('\n');

    expect(imports).not.toMatch(/out\/history|ConversationSqliteEventHistory/);
  });

  it('depends on the owner-scoped CopilotKit history transport rather than the concrete SQLite adapter', async () => {
    const source = await readFile(new URL('./conversation-copilotkit.controller.ts', import.meta.url), 'utf8');

    expect(source).toContain('COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT');
    expect(source).not.toContain("../../../out/history/sqlite/copilotkit-sqlite-event-history");
  });

  it('detaches a browser subscriber without releasing the organization-owned provider turn before its exact terminal', async () => {
    const owner = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
    };
    const sinks: Array<(event: { kind: 'status'; status: 'interrupted' }) => void> = [];
    const gateway = {
      list: vi.fn().mockResolvedValue([{
        id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'History',
        createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
      }]),
      readiness: vi.fn().mockReturnValue([{
        runtime: 'codex_cli',
        ready: true,
        readiness: {
          runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
          modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
          loginVerified: true, mcpProtocolRevision: '2026-07-28',
        },
      }]),
      start: vi.fn().mockReturnValue({
        turnId: 'run-1',
        ready: Promise.resolve(),
        subscribe: (sink: (event: { kind: 'status'; status: 'interrupted' }) => void) => {
          sinks.push(sink);
          return vi.fn();
        },
      }),
      interrupt: vi.fn().mockResolvedValue(undefined),
    };
    const conversations = new ConversationService(gateway as never, { delete: vi.fn() }, () => 'run-1');
    const agent = new GatewayConversationAgUiAgent(conversations, owner);
    const runner = new GatewayConversationAgentRunner(conversations, {
      run: vi.fn(),
      connect: vi.fn(),
    } as never, owner);
    const subscription = agent.run({
      threadId: 'conversation-1',
      runId: 'run-1',
      state: {},
      messages: [{ id: 'user-1', role: 'user', content: 'Keep running after this browser leaves.' }],
      tools: [],
      context: [],
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    }).subscribe();

    await waitFor(() => gateway.start.mock.calls.length === 1 && sinks.length === 2);
    subscription.unsubscribe();

    await expect(conversations.isRunning({ ...owner, conversationId: 'conversation-1' })).resolves.toBe(true);
    await expect(runner.stop({ threadId: 'conversation-1' })).resolves.toBe(true);
    expect(gateway.interrupt).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1', turnId: 'run-1' });

    for (const sink of sinks) sink({ kind: 'status', status: 'interrupted' });
    await waitFor(async () => !(await conversations.isRunning({ ...owner, conversationId: 'conversation-1' })));
  });

  it('uses SQLite only for run/connect while the owner port resolves the stored exact live turn for stop', async () => {
    const conversations = {
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
    };
    const eventHistory = {
      run: vi.fn().mockReturnValue(of({ type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'run-1' })),
      connect: vi.fn().mockReturnValue(of({ type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'historic-run' })),
    };
    const owner = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
    };
    const runner = new GatewayConversationAgentRunner(conversations as never, eventHistory as never, owner);

    await expect(firstValueFrom(runner.connect({ threadId: 'conversation-1' })))
      .resolves.toEqual({
        type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'historic-run',
      });
    await expect(firstValueFrom(runner.run({
      threadId: 'conversation-1',
      agent: {} as never,
      input: { threadId: 'conversation-1', runId: 'run-1', state: {}, messages: [] },
    }))).resolves.toEqual({ type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'run-1' });
    await expect(runner.isRunning({ threadId: 'conversation-1' })).resolves.toBe(true);
    await expect(runner.stop({ threadId: 'conversation-1' })).resolves.toBe(true);
    expect(eventHistory.connect).toHaveBeenCalledWith(owner, { threadId: 'conversation-1' });
    expect(eventHistory.run).toHaveBeenCalledWith(owner, expect.objectContaining({ threadId: 'conversation-1' }));
    expect(conversations.isRunning).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1' });
    expect(conversations.stop).toHaveBeenCalledWith({
      ...owner,
      conversationId: 'conversation-1',
    });
  });

  it('accepts the stock runner stop request without a browser-supplied runId', async () => {
    const owner = { organizationId: 'organization-1', userId: 'user-1' };
    const conversations = {
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
      readiness: vi.fn().mockReturnValue([]),
    };
    const eventHistory = createHistoryTransport();
    const runner = new GatewayConversationAgentRunner(conversations as never, eventHistory, owner);

    await expect(runner.stop({ threadId: 'conversation-1' } as never)).resolves.toBe(true);
    expect(conversations.stop).toHaveBeenCalledWith({
      ...owner,
      conversationId: 'conversation-1',
    });
  });

  it('fences a foreign organization before it can start a provider turn or replay SQLite history', async () => {
    const conversations = {
      assertAccessible: vi.fn().mockRejectedValue(new Error('conversation_not_found')),
      isRunning: vi.fn(),
      stop: vi.fn(),
    };
    const eventHistory = {
      run: vi.fn().mockReturnValue(of({ type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'run-1' })),
      connect: vi.fn().mockReturnValue(of({ type: 'RUN_STARTED', threadId: 'conversation-1', runId: 'historic-run' })),
    };
    const runner = new GatewayConversationAgentRunner(conversations as never, eventHistory as never, {
      organizationId: '00000000-0000-4000-8000-000000000004',
      userId: '00000000-0000-4000-8000-000000000005',
    });

    await expect(firstValueFrom(runner.connect({ threadId: 'conversation-1' })))
      .rejects.toThrow('conversation_not_found');
    await expect(firstValueFrom(runner.run({
      threadId: 'conversation-1',
      agent: {} as never,
      input: { threadId: 'conversation-1', runId: 'run-1', state: {}, messages: [] },
    }))).rejects.toThrow('conversation_not_found');

    expect(conversations.assertAccessible).toHaveBeenCalledTimes(2);
    expect(eventHistory.connect).not.toHaveBeenCalled();
    expect(eventHistory.run).not.toHaveBeenCalled();
  });

  it('opens one assistant message across many deltas and closes a disconnected turn with RUN_ERROR only', () => {
    const mapper = new GatewayAgUiEventMapper({
      threadId: 'conversation-1',
      runId: 'turn-1',
      messageId: 'assistant-turn-1',
    });

    expect(mapper.map({ kind: 'assistant.delta', delta: 'Provider-owned ' })).toEqual([
      { type: 'TEXT_MESSAGE_START', messageId: 'assistant-turn-1', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'assistant-turn-1', delta: 'Provider-owned ' },
    ]);
    expect(mapper.map({ kind: 'assistant.delta', delta: 'response.' })).toEqual([
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'assistant-turn-1', delta: 'response.' },
    ]);
    expect(mapper.map({ kind: 'status', status: 'disconnected' })).toEqual([
      { type: 'TEXT_MESSAGE_END', messageId: 'assistant-turn-1' },
      { type: 'RUN_ERROR', message: 'The provider turn ended. Send a new message when you are ready.' },
    ]);
    expect(mapper.map({ kind: 'status', status: 'disconnected' })).toEqual([]);
  });

  it('emits supported RUN_FINISHED outcomes for completed and interrupted provider terminals', () => {
    const mapper = new GatewayAgUiEventMapper({
      threadId: 'conversation-1',
      runId: 'turn-1',
      messageId: 'assistant-turn-1',
    });

    expect(mapper.map({ kind: 'status', status: 'completed' })).toEqual([
      { type: 'RUN_FINISHED', threadId: 'conversation-1', runId: 'turn-1', outcome: { type: 'success' } },
    ]);

    const interrupted = new GatewayAgUiEventMapper({
      threadId: 'conversation-1',
      runId: 'turn-2',
      messageId: 'assistant-turn-2',
    });
    expect(interrupted.map({ kind: 'status', status: 'interrupted' })).toEqual([
      {
        type: 'RUN_FINISHED',
        threadId: 'conversation-1',
        runId: 'turn-2',
        outcome: { type: 'interrupt', interrupts: [] },
      },
    ]);
  });

  it('accepts the public 1.69 single-route info envelope after Nest has parsed the JSON body', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn(), input: vi.fn(), interrupt: vi.fn(), isRunning: vi.fn(), stop: vi.fn(),
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      readiness: vi.fn().mockReturnValue([{ runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' }]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [
        { provide: CONVERSATION_PORT, useValue: conversations },
        { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useValue: createHistoryTransport() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = {
          id: '00000000-0000-4000-8000-000000000002',
          organizationId: '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .send({ method: 'info', params: {}, body: {} })
      .expect(200);

    expect(response.body).toMatchObject({
      agents: {
        conversation: {
          capabilities: {
            custom: {
              gatewayReadiness: [{ runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' }],
            },
          },
        },
      },
    });
  });

  it('routes a stock single-route stop through the authenticated owner conversation slot without a browser runId', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn(), input: vi.fn(), interrupt: vi.fn(), isRunning: vi.fn(),
      stop: vi.fn().mockResolvedValue(true),
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [
        { provide: CONVERSATION_PORT, useValue: conversations },
        { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useValue: createHistoryTransport() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = {
          id: '00000000-0000-4000-8000-000000000002',
          organizationId: '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .send({
        method: 'agent/stop',
        params: { agentId: 'conversation', threadId: 'conversation-1' },
      })
      .expect(200);

    expect(response.body).toMatchObject({ stopped: true });
    expect(conversations.stop).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
    });
  });

  it('streams an authenticated conversation agent run through Nest parsed JSON with explicit turn settings', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((sink: (event: unknown) => void) => {
      sink({ kind: 'assistant.delta', delta: 'Provider answer.' });
      sink({ kind: 'status', status: 'completed' });
      return unsubscribe;
    });
    const conversations = {
      list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn().mockResolvedValue({
        turnId: 'run-1',
        ready: Promise.resolve(),
        subscribe,
      }),
      input: vi.fn(), interrupt: vi.fn(), isRunning: vi.fn(), stop: vi.fn(),
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [
        { provide: CONVERSATION_PORT, useValue: conversations },
        { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useValue: createHistoryTransport() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = {
          id: '00000000-0000-4000-8000-000000000002',
          organizationId: '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .send({
        method: 'agent/run',
        params: { agentId: 'conversation' },
        body: {
          threadId: 'conversation-1',
          runId: 'run-1',
          state: {},
          messages: [{ id: 'user-1', role: 'user', content: 'Review this supplier.' }],
          tools: [],
          context: [],
          forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
        },
      })
      .expect('content-type', /text\/event-stream/)
      .expect(200);

    expect(response.text).toContain('RUN_STARTED');
    expect(response.text).toContain('TEXT_MESSAGE_CONTENT');
    expect(response.text).toContain('Provider answer.');
    expect(response.text).toContain('RUN_FINISHED');
    expect(conversations.start).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'run-1',
      message: 'Review this supplier.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('replays completed history to another member of the same organization and fences a foreign organization', async () => {
    const subscribe = vi.fn((sink: (event: unknown) => void) => {
      sink({ kind: 'assistant.delta', delta: 'Organization-visible provider answer.' });
      sink({ kind: 'status', status: 'completed' });
      return vi.fn();
    });
    const conversations = {
      list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn().mockResolvedValue({
        turnId: 'run-owner-a',
        ready: Promise.resolve(),
        subscribe,
      }),
      input: vi.fn(), interrupt: vi.fn(), isRunning: vi.fn(), stop: vi.fn(),
      assertAccessible: vi.fn().mockImplementation(async (input: { organizationId: string }) => {
        if (input.organizationId !== '00000000-0000-4000-8000-000000000001') {
          throw new AgentOsRuntimeError('conversation_not_found');
        }
      }),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [
        { provide: CONVERSATION_PORT, useValue: conversations },
        { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useValue: createHistoryTransport() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = {
          id: req.headers['x-test-user-id'] === 'owner-b'
            ? '00000000-0000-4000-8000-000000000003'
            : '00000000-0000-4000-8000-000000000002',
          organizationId: req.headers['x-test-organization-id'] === 'organization-b'
            ? '00000000-0000-4000-8000-000000000004'
            : '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const body = {
      threadId: 'conversation-owner-fence',
      runId: 'run-owner-a',
      state: {},
      messages: [{ id: 'user-owner-a', role: 'user', content: 'Organization conversation prompt.' }],
      tools: [],
      context: [],
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    };
    await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-user-id', 'owner-a')
      .send({ method: 'agent/run', params: { agentId: 'conversation' }, body })
      .expect(200);

    const sameOrganizationConnect = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-user-id', 'owner-b')
      .send({
        method: 'agent/connect',
        params: { agentId: 'conversation' },
        body: { ...body, runId: 'connect-owner-b', messages: [] },
      })
      .expect(200);

    const foreignConnect = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-organization-id', 'organization-b')
      .send({
        method: 'agent/connect',
        params: { agentId: 'conversation' },
        body: { ...body, runId: 'connect-organization-b', messages: [] },
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-organization-id', 'organization-b')
      .send({
        method: 'agent/run',
        params: { agentId: 'conversation' },
        body: { ...body, runId: 'run-organization-b' },
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-organization-id', 'organization-b')
      .send({
        method: 'agent/stop',
        params: { agentId: 'conversation', threadId: 'conversation-owner-fence' },
        body: {},
      })
      .expect(404);

    expect(sameOrganizationConnect.text).toContain('Organization-visible provider answer.');
    expect(foreignConnect.text).not.toContain('Organization-visible provider answer.');
    expect(conversations.start).toHaveBeenCalledTimes(1);
    expect(conversations.assertAccessible).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000004',
      userId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-owner-fence',
    });
  });

  it('rejects an oversized CopilotKit prompt before the owner conversation port is called', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn(), input: vi.fn(), interrupt: vi.fn(), isRunning: vi.fn(), stop: vi.fn(),
      assertAccessible: vi.fn().mockResolvedValue(undefined),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [
        { provide: CONVERSATION_PORT, useValue: conversations },
        { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useValue: createHistoryTransport() },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = {
          id: '00000000-0000-4000-8000-000000000002',
          organizationId: '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .send({
        method: 'agent/run',
        params: { agentId: 'conversation' },
        body: {
          threadId: 'conversation-oversized',
          runId: 'run-oversized',
          state: {},
          messages: [{ id: 'user-oversized', role: 'user', content: 'x'.repeat(16_001) }],
          tools: [],
          context: [],
          forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
        },
      })
      .expect(200);

    expect(response.text).toContain('RUN_ERROR');
    expect(conversations.start).not.toHaveBeenCalled();
  });
});

async function waitFor(predicate: () => boolean | Promise<boolean>, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition_timed_out');
}
