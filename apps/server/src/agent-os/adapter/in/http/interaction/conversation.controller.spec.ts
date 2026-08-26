import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONVERSATION_PORT } from '../../../../application/port/in/capability/conversation.port';
import { ConversationController } from './conversation.controller';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

const PREFERENCES = {
  schemaVersion: 1 as const,
  contexts: {
    general: {
      codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' },
    },
  },
};

let app: INestApplication | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('ConversationController', () => {
  it('derives organization and user scope and accepts no provider or execution coordinates', async () => {
    const conversations = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
      history: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      start: vi.fn(),
      input: vi.fn(),
      interrupt: vi.fn(),
    };
    const controller = new ConversationController(conversations as never);

    await expect(controller.create(
      { conversationId: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).resolves.toEqual({ id: 'conversation-1' });
    expect(conversations.create).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      conversationId: 'conversation-1',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General',
    });

    await expect(controller.create(
      {
        conversationId: 'conversation-1',
        runtime: 'codex_cli',
        agentKey: null,
        title: 'General',
        providerConversationRef: 'private',
        executionBinding: 'private',
      },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow('Invalid conversation create request.');
  });

  it('requires model and reasoning effort on each turn and does not accept runtime patching', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn().mockResolvedValue({ turnId: 'turn-1' }), input: vi.fn(), interrupt: vi.fn(),
    };
    const controller = new ConversationController(conversations as never);

    await expect(controller.start(
      'conversation-1',
      { message: 'Review this.', model: 'gpt-5.6', reasoningEffort: 'low' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).resolves.toEqual({ turnId: 'turn-1' });
    expect(conversations.start).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      conversationId: 'conversation-1',
      message: 'Review this.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    await expect(controller.start(
      'conversation-1',
      { message: 'Review this.', model: 'gpt-5.6' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow('Invalid conversation turn request.');
    await expect(controller.rename(
      'conversation-1',
      { title: 'Renamed', runtime: 'claude_cli' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow('Invalid conversation rename request.');
    await expect(controller.input(
      'conversation-1',
      'turn-1',
      { message: 'More context.', providerConversationRef: 'private' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).rejects.toThrow('Invalid conversation input request.');
  });

  it('forwards every bounded endpoint with the authenticated owner fence', async () => {
    const conversations = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      history: vi.fn().mockResolvedValue([]),
      rename: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
      delete: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      input: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new ConversationController(conversations as never);
    const user = { id: USER_ID } as never;

    await controller.list(ORGANIZATION_ID, user);
    await controller.history('conversation-1', ORGANIZATION_ID, user);
    await controller.rename('conversation-1', { title: 'Renamed' }, ORGANIZATION_ID, user);
    await controller.input('conversation-1', 'turn-1', { message: 'More context.' }, ORGANIZATION_ID, user);
    await controller.interrupt('conversation-1', 'turn-1', ORGANIZATION_ID, user);
    await controller.delete('conversation-1', ORGANIZATION_ID, user);

    const owner = { organizationId: ORGANIZATION_ID, userId: USER_ID };
    expect(conversations.list).toHaveBeenCalledWith(owner);
    expect(conversations.history).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1' });
    expect(conversations.rename).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1', title: 'Renamed' });
    expect(conversations.input).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1', turnId: 'turn-1', message: 'More context.' });
    expect(conversations.interrupt).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1', turnId: 'turn-1' });
    expect(conversations.delete).toHaveBeenCalledWith({ ...owner, conversationId: 'conversation-1' });
  });

  it('maps turn validation to 400 and Gateway absence to 503 instead of leaking 500', async () => {
    const conversations = {
      list: vi.fn(), create: vi.fn(), history: vi.fn(), rename: vi.fn(), delete: vi.fn(),
      start: vi.fn()
        .mockRejectedValueOnce(new AgentOsRuntimeError('conversation_model_unsupported'))
        .mockRejectedValueOnce(new AgentOsRuntimeError('conversation_gateway_unavailable')),
      input: vi.fn(), interrupt: vi.fn(),
    };
    const controller = new ConversationController(conversations as never);
    const body = { message: 'Review this.', model: 'gpt-5.6', reasoningEffort: 'low' };

    await expect(controller.start('conversation-1', body, ORGANIZATION_ID, { id: USER_ID } as never))
      .rejects.toMatchObject({ status: 400 });
    await expect(controller.start('conversation-1', body, ORGANIZATION_ID, { id: USER_ID } as never))
      .rejects.toMatchObject({ status: 503 });
  });

  it('exposes exact authenticated create and preference routes with strict browser payloads', async () => {
    const canonicalCreates = new Map<string, string>();
    const conversations = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(async (input: {
        organizationId: string;
        userId: string;
        conversationId: string;
        runtime: 'codex_cli' | 'claude_cli';
        agentKey: string | null;
        title: string;
      }) => {
        const key = `${input.organizationId}\u0000${input.userId}\u0000${input.conversationId}`;
        const canonical = JSON.stringify({
          runtime: input.runtime,
          agentKey: input.agentKey,
          title: input.title,
        });
        const previous = canonicalCreates.get(key);
        if (previous && previous !== canonical) throw new AgentOsRuntimeError('conversation_create_conflict');
        canonicalCreates.set(key, canonical);
        return {
          id: input.conversationId,
          runtime: input.runtime,
          agentKey: input.agentKey,
          title: input.title,
          createdAt: '2026-08-26T00:00:00.000Z',
          updatedAt: '2026-08-26T00:00:00.000Z',
        };
      }),
      history: vi.fn().mockResolvedValue([]),
      rename: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      input: vi.fn(),
      interrupt: vi.fn(),
      preferences: vi.fn().mockResolvedValue(PREFERENCES),
      setPreference: vi.fn(async (input: { model: string; reasoningEffort: string }) => {
        if (input.model !== 'gpt-5.6' || input.reasoningEffort !== 'low') {
          throw new AgentOsRuntimeError('conversation_reasoning_effort_unsupported');
        }
        return PREFERENCES;
      }),
      disconnect: vi.fn(),
      readiness: vi.fn().mockReturnValue([]),
    };
    const server = await interactionApp(conversations);
    const create = {
      conversationId: 'conversation-create-1',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General chat',
    };

    await request(server.getHttpServer())
      .post('/api/agent-os/conversations')
      .send({ runtime: 'codex_cli', agentKey: null, title: 'Missing ID' })
      .expect(400);
    await request(server.getHttpServer())
      .post('/api/agent-os/conversations')
      .send({ conversationId: 'conversation-missing-title', runtime: 'codex_cli', agentKey: null })
      .expect(400);

    const first = await request(server.getHttpServer())
      .post('/api/agent-os/conversations')
      .send(create)
      .expect(201);
    const replay = await request(server.getHttpServer())
      .post('/api/agent-os/conversations')
      .send(create)
      .expect(201);
    expect(first.body).toEqual(replay.body);
    await request(server.getHttpServer())
      .post('/api/agent-os/conversations')
      .send({ ...create, title: 'Changed immutable title' })
      .expect(409);

    for (const [field, value] of Object.entries({
      organizationId: 'forged-org',
      userId: 'forged-user',
      providerConversationRef: 'private-provider-ref',
      providerReference: 'private-provider-ref',
      credential: 'private-credential',
      executionBinding: 'private-binding',
      transcript: [{ role: 'user', content: 'must not persist' }],
      unexpected: true,
    })) {
      await request(server.getHttpServer())
        .post('/api/agent-os/conversations')
        .send({ ...create, conversationId: `conversation-reject-${field}`, [field]: value })
        .expect(400);
    }

    const loaded = await request(server.getHttpServer())
      .get('/api/agent-os/conversation-preferences')
      .expect(200);
    expect(loaded.body).toEqual(PREFERENCES);
    expect(JSON.stringify(loaded.body)).not.toContain('providerConversationRef');

    const preference = {
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    };
    await request(server.getHttpServer())
      .put('/api/agent-os/conversation-preferences')
      .send(preference)
      .expect(200)
      .expect(PREFERENCES);
    await request(server.getHttpServer())
      .put('/api/agent-os/conversation-preferences')
      .send({ ...preference, organizationId: 'forged-org' })
      .expect(400);
    await request(server.getHttpServer())
      .put('/api/agent-os/conversation-preferences')
      .send({ ...preference, providerConversationRef: 'private-provider-ref' })
      .expect(400);
    await request(server.getHttpServer())
      .put('/api/agent-os/conversation-preferences')
      .send({ ...preference, reasoningEffort: 'high' })
      .expect(400);

    const owner = { organizationId: ORGANIZATION_ID, userId: USER_ID };
    expect(conversations.create).toHaveBeenCalledWith({ ...owner, ...create });
    expect(conversations.preferences).toHaveBeenCalledWith(owner);
    expect(conversations.setPreference).toHaveBeenCalledWith({ ...owner, ...preference });
  });

  it('maps create drift and live deletion to conflicts, missing conversations to 404, and raw Gateway failures to a safe 503', async () => {
    const conversations = {
      list: vi.fn(),
      create: vi.fn()
        .mockRejectedValueOnce(new AgentOsRuntimeError('conversation_create_conflict'))
        .mockRejectedValueOnce(new Error('provider thread private-reference-123 failed')),
      history: vi.fn().mockRejectedValue(new AgentOsRuntimeError('conversation_not_found')),
      rename: vi.fn(),
      delete: vi.fn().mockRejectedValue(new AgentOsRuntimeError('conversation_turn_live')),
      start: vi.fn(),
      input: vi.fn(),
      interrupt: vi.fn(),
      preferences: vi.fn(),
      setPreference: vi.fn(),
    };
    const controller = new ConversationController(conversations as never);
    const create = { conversationId: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General' };

    await expect(controller.create(create, ORGANIZATION_ID, { id: USER_ID } as never))
      .rejects.toMatchObject({ status: 409 });
    await expect(controller.delete('conversation-1', ORGANIZATION_ID, { id: USER_ID } as never))
      .rejects.toMatchObject({ status: 409 });
    await expect(controller.history('conversation-absent', ORGANIZATION_ID, { id: USER_ID } as never))
      .rejects.toMatchObject({ status: 404 });

    const unavailable = await controller.create(create, ORGANIZATION_ID, { id: USER_ID } as never)
      .catch((error: unknown) => error as { status: number; getResponse(): unknown });
    expect(unavailable).toMatchObject({ status: 503 });
    expect(JSON.stringify(unavailable.getResponse())).not.toContain('private-reference-123');
  });
});

async function interactionApp(conversations: unknown): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ConversationController],
    providers: [{ provide: CONVERSATION_PORT, useValue: conversations }],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use((
    req: Request & { authUser?: { id: string; organizationId: string } },
    _res: Response,
    next: NextFunction,
  ) => {
    req.authUser = { id: USER_ID, organizationId: ORGANIZATION_ID };
    next();
  });
  await app.init();
  return app;
}
