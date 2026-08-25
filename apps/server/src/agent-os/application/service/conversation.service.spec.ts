import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConversationService } from './conversation.service';
import { CONVERSATION_TURN_ID_FACTORY } from '../port/in/capability/conversation.port';
import { GATEWAY_CONVERSATION_PORT } from '../port/out/gateway-conversation.port';
import type { GatewayConversationPort } from '../port/out/gateway-conversation.port';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
};

const GENERAL_CONVERSATION = {
  id: 'conversation-general',
  runtime: 'codex_cli' as const,
  agentKey: null,
  title: 'General planning',
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:01:00.000Z',
};

function readyGateway(): GatewayConversationPort {
  return {
    list: vi.fn().mockResolvedValue([GENERAL_CONVERSATION]),
    create: vi.fn().mockResolvedValue(GENERAL_CONVERSATION),
    history: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({ ...GENERAL_CONVERSATION, title: 'Renamed' }),
    delete: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: () => () => undefined,
    }),
    input: vi.fn().mockResolvedValue(undefined),
    interrupt: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    readiness: vi.fn().mockReturnValue([
      {
        runtime: 'codex_cli',
        ready: true,
        readiness: {
          runtime: 'codex_cli',
          version: '0.149.1',
          models: ['gpt-5.6'],
          reasoningEfforts: ['low', 'xhigh'],
          modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low', 'xhigh'] }],
          loginVerified: true,
          mcpProtocolRevision: '2026-07-28',
        },
      },
      { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
    ]),
  };
}

describe('ConversationService', () => {
  it('is constructable by Nest from its explicit conversation ports', async () => {
    const gateway = readyGateway();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: GATEWAY_CONVERSATION_PORT, useValue: gateway },
        { provide: CONVERSATION_TURN_ID_FACTORY, useValue: () => 'turn-1' },
      ],
    }).compile();

    expect(moduleRef.get(ConversationService)).toBeInstanceOf(ConversationService);
    await moduleRef.close();
  });

  it('returns only Gateway descriptors and fences a provider conversation to its owner', async () => {
    const gateway = readyGateway();
    const service = new ConversationService(gateway, () => 'turn-1');

    await expect(service.list(OWNER)).resolves.toEqual([GENERAL_CONVERSATION]);
    await expect(service.history({ ...OWNER, conversationId: GENERAL_CONVERSATION.id })).resolves.toEqual([]);
    await expect(service.history({ ...OWNER, organizationId: 'foreign-org', conversationId: GENERAL_CONVERSATION.id }))
      .rejects.toThrow('conversation_not_found');

    expect(gateway.list).toHaveBeenCalledWith(OWNER);
    expect(gateway.history).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
  });

  it('creates General with agentKey null and accepts only the five fixed Agent keys', async () => {
    const gateway = readyGateway();
    const service = new ConversationService(gateway, () => 'turn-1');

    await service.create({ ...OWNER, runtime: 'codex_cli', agentKey: null });
    await service.create({ ...OWNER, runtime: 'codex_cli', agentKey: 'sourcing' });

    expect(gateway.create).toHaveBeenNthCalledWith(1, {
      ...OWNER,
      runtime: 'codex_cli',
      agentKey: null,
    });
    expect(gateway.create).toHaveBeenNthCalledWith(2, {
      ...OWNER,
      runtime: 'codex_cli',
      agentKey: 'sourcing',
    });
    await expect(service.create({ ...OWNER, runtime: 'codex_cli', agentKey: 'operator' }))
      .rejects.toThrow('conversation_agent_invalid');
  });

  it('fails closed when a provider returns one conversation ID for different owners', async () => {
    const gateway = readyGateway();
    const service = new ConversationService(gateway, () => 'turn-1');
    const otherOwner = {
      organizationId: OWNER.organizationId,
      userId: '00000000-0000-4000-8000-000000000003',
    };

    await service.create({ ...OWNER, runtime: 'codex_cli', agentKey: null });
    await expect(service.create({ ...otherOwner, runtime: 'codex_cli', agentKey: null }))
      .rejects.toThrow('conversation_not_found');

    await expect(service.history({ ...OWNER, conversationId: GENERAL_CONVERSATION.id })).resolves.toEqual([]);
    await expect(service.history({ ...otherOwner, conversationId: GENERAL_CONVERSATION.id }))
      .rejects.toThrow('conversation_not_found');
  });

  it('requires a supported model and effort for every explicit turn without a fallback', async () => {
    const gateway = readyGateway();
    const service = new ConversationService(gateway, () => 'turn-1');
    await service.list(OWNER);

    await expect(service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Review the evidence.',
      model: '',
      reasoningEffort: 'low',
    })).rejects.toThrow('conversation_model_required');
    await expect(service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Review the evidence.',
      model: 'gpt-5.6',
      reasoningEffort: 'high',
    })).rejects.toThrow('conversation_reasoning_effort_unsupported');

    await expect(service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Review the evidence.',
      model: 'gpt-5.6',
      reasoningEffort: 'xhigh',
    })).resolves.toMatchObject({ turnId: 'turn-1' });
    expect(gateway.start).toHaveBeenCalledWith({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Review the evidence.',
      model: 'gpt-5.6',
      reasoningEffort: 'xhigh',
    });
  });

  it('does not create a restart turn when a live stream reports disconnection', async () => {
    const gateway = readyGateway();
    const events: Array<{ kind: string; status?: string }> = [];
    const unsubscribe = vi.fn();
    let recorded = false;
    vi.mocked(gateway.start).mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: (sink) => {
        sink({ kind: 'status', status: 'disconnected' });
        if (!recorded) {
          events.push({ kind: 'status', status: 'disconnected' });
          recorded = true;
        }
        return unsubscribe;
      },
    });
    const service = new ConversationService(gateway, () => 'turn-1');
    await service.list(OWNER);

    const turn = await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'One explicit turn only.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    turn.subscribe(() => undefined);

    expect(events).toEqual([{ kind: 'status', status: 'disconnected' }]);
    expect(gateway.start).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cleans a terminal turn even when the REST caller never subscribes to its live stream', async () => {
    const gateway = readyGateway();
    let lifecycleSink: ((event: { kind: 'status'; status: 'disconnected' }) => void) | undefined;
    vi.mocked(gateway.start).mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: (sink) => {
        lifecycleSink = sink as typeof lifecycleSink;
        return () => undefined;
      },
    });
    const service = new ConversationService(gateway, () => 'turn-1');
    await service.list(OWNER);

    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'One explicit turn only.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    lifecycleSink?.({ kind: 'status', status: 'disconnected' });

    await expect(service.input({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Do not reuse a disconnected turn.',
    })).rejects.toThrow('conversation_not_found');
  });

  it('forwards every Gateway command only after the owner fence is established', async () => {
    const gateway = readyGateway();
    const service = new ConversationService(gateway, () => 'turn-1');
    await service.list(OWNER);

    await service.rename({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, title: 'Renamed' });
    await service.history({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Start one turn.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    await service.input({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Additional context.',
    });
    await service.interrupt({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, turnId: 'turn-1' });
    await service.delete({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });

    expect(gateway.rename).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, title: 'Renamed' });
    expect(gateway.history).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
    expect(gateway.input).toHaveBeenCalledWith({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Additional context.',
    });
    expect(gateway.interrupt).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, turnId: 'turn-1' });
    expect(gateway.delete).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
    await expect(service.input({
      ...OWNER,
      organizationId: 'foreign-org',
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Not allowed.',
    })).rejects.toThrow('conversation_not_found');
  });
});
