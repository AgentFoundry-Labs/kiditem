import { describe, expect, it, vi } from 'vitest';
import { ConversationController } from './conversation.controller';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

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
      { runtime: 'codex_cli', agentKey: null, title: 'General' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    )).resolves.toEqual({ id: 'conversation-1' });
    expect(conversations.create).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General',
    });

    await expect(controller.create(
      { runtime: 'codex_cli', agentKey: null, providerConversationRef: 'private', executionBinding: 'private' },
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
});
