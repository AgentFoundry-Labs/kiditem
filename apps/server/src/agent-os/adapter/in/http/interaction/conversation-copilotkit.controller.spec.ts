import type { INestApplication } from '@nestjs/common';
import { CONVERSATION_PORT } from '../../../../application/port/in/capability/conversation.port';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConversationCopilotkitController,
  GatewayAgUiEventMapper,
} from './conversation-copilotkit.controller';

let app: INestApplication | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('GatewayAgUiEventMapper', () => {
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

  it('emits RUN_FINISHED only for a completed provider turn', () => {
    const mapper = new GatewayAgUiEventMapper({
      threadId: 'conversation-1',
      runId: 'turn-1',
      messageId: 'assistant-turn-1',
    });

    expect(mapper.map({ kind: 'status', status: 'completed' })).toEqual([
      { type: 'RUN_FINISHED', threadId: 'conversation-1', runId: 'turn-1', outcome: { type: 'success' } },
    ]);
  });

  it('accepts the public 1.69 single-route info envelope after Nest has parsed the JSON body', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn(), input: vi.fn(), interrupt: vi.fn(), disconnect: vi.fn(),
      readiness: vi.fn().mockReturnValue([{ runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' }]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [{ provide: CONVERSATION_PORT, useValue: conversations }],
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

  it('streams an authenticated conversation agent run through Nest parsed JSON with explicit turn settings', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((sink: (event: unknown) => void) => {
      sink({ kind: 'assistant.delta', delta: 'Provider answer.' });
      sink({ kind: 'status', status: 'completed' });
      return unsubscribe;
    });
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn().mockResolvedValue({
        turnId: 'run-1',
        ready: Promise.resolve(),
        subscribe,
      }),
      input: vi.fn(), interrupt: vi.fn(), disconnect: vi.fn(),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [{ provide: CONVERSATION_PORT, useValue: conversations }],
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

  it('does not replay a completed owner turn through CopilotKit connect for another authenticated owner', async () => {
    const subscribe = vi.fn((sink: (event: unknown) => void) => {
      sink({ kind: 'assistant.delta', delta: 'Owner-only provider answer.' });
      sink({ kind: 'status', status: 'completed' });
      return vi.fn();
    });
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn().mockResolvedValue({
        turnId: 'run-owner-a',
        ready: Promise.resolve(),
        subscribe,
      }),
      input: vi.fn(), interrupt: vi.fn(), disconnect: vi.fn(),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [{ provide: CONVERSATION_PORT, useValue: conversations }],
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
          organizationId: '00000000-0000-4000-8000-000000000001',
        };
        next();
      },
    );
    await app.init();

    const body = {
      threadId: 'conversation-owner-fence',
      runId: 'run-owner-a',
      state: {},
      messages: [{ id: 'user-owner-a', role: 'user', content: 'Private owner prompt.' }],
      tools: [],
      context: [],
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    };
    await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-user-id', 'owner-a')
      .send({ method: 'agent/run', params: { agentId: 'conversation' }, body })
      .expect(200);

    const foreignConnect = await request(app.getHttpServer())
      .post('/api/copilotkit')
      .set('x-test-user-id', 'owner-b')
      .send({
        method: 'agent/connect',
        params: { agentId: 'conversation' },
        body: { ...body, runId: 'connect-owner-b', messages: [] },
      })
      .expect(200);

    expect(foreignConnect.text).not.toContain('Owner-only provider answer.');
    expect(conversations.start).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized CopilotKit prompt before the owner conversation port is called', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn(), input: vi.fn(), interrupt: vi.fn(), disconnect: vi.fn(),
      readiness: vi.fn().mockReturnValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationCopilotkitController],
      providers: [{ provide: CONVERSATION_PORT, useValue: conversations }],
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
