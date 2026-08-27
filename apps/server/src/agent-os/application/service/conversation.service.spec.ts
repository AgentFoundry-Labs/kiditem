import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConversationService } from './conversation.service';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { CONVERSATION_TURN_ID_FACTORY } from '../port/in/capability/conversation.port';
import { GATEWAY_CONVERSATION_PORT } from '../port/out/gateway-conversation.port';
import type { GatewayConversationPort } from '../port/out/gateway-conversation.port';
import type { ConversationEventHistoryPort } from '../port/out/history/conversation-event-history.port';
import { CONVERSATION_EVENT_HISTORY_PORT } from '../port/out/history/conversation-event-history.port';

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

const PREFERENCES = {
  schemaVersion: 1 as const,
  contexts: {
    general: {
      codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' },
    },
    advertising: {
      claude_cli: { model: 'obsolete-model', reasoningEffort: 'obsolete-effort' },
    },
  },
};

type GatewayDouble = GatewayConversationPort & {
  preferences: () => Promise<typeof PREFERENCES>;
  setPreference: (input: unknown) => Promise<typeof PREFERENCES>;
};

function readyGateway(): GatewayDouble {
  return {
    list: vi.fn().mockResolvedValue([GENERAL_CONVERSATION]),
    create: vi.fn().mockImplementation(async (input: {
      conversationId: string;
      runtime: 'codex_cli' | 'claude_cli';
      agentKey: string | null;
      title: string;
    }) => ({
      ...GENERAL_CONVERSATION,
      id: input.conversationId,
      runtime: input.runtime,
      agentKey: input.agentKey,
      title: input.title,
    })),
    rename: vi.fn().mockResolvedValue({ ...GENERAL_CONVERSATION, title: 'Renamed' }),
    delete: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: () => () => undefined,
    }),
    interrupt: vi.fn().mockResolvedValue(undefined),
    preferences: vi.fn().mockResolvedValue(PREFERENCES),
    setPreference: vi.fn().mockResolvedValue(PREFERENCES),
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
  } as unknown as GatewayDouble;
}

function readyEventHistory(): ConversationEventHistoryPort {
  return { delete: vi.fn() };
}

function createService(
  gateway: GatewayConversationPort,
  nextTurnId: () => string,
  eventHistory: ConversationEventHistoryPort = readyEventHistory(),
): ConversationService {
  return new ConversationService(gateway, eventHistory, nextTurnId);
}

describe('ConversationService', () => {
  it('is constructable by Nest from its explicit conversation ports', async () => {
    const gateway = readyGateway();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: GATEWAY_CONVERSATION_PORT, useValue: gateway },
        { provide: CONVERSATION_EVENT_HISTORY_PORT, useValue: readyEventHistory() },
        { provide: CONVERSATION_TURN_ID_FACTORY, useValue: () => 'turn-1' },
      ],
    }).compile();

    expect(moduleRef.get(ConversationService)).toBeInstanceOf(ConversationService);
    await moduleRef.close();
  });

  it('returns only Gateway descriptors and forwards conversation operations with authenticated organization scope', async () => {
    const gateway = readyGateway();
    const service = createService(gateway, () => 'turn-1');

    await expect(service.list(OWNER)).resolves.toEqual([GENERAL_CONVERSATION]);

    expect(gateway.list).toHaveBeenCalledWith(OWNER);
  });

  it('creates the browser-selected immutable identity and accepts only the five fixed Agent keys', async () => {
    const gateway = readyGateway();
    const service = createService(gateway, () => 'turn-1');

    await service.create({
      ...OWNER,
      conversationId: 'conversation-general',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General planning',
    });
    await service.create({
      ...OWNER,
      conversationId: 'conversation-sourcing',
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Sourcing planning',
    });

    expect(gateway.create).toHaveBeenNthCalledWith(1, {
      ...OWNER,
      conversationId: 'conversation-general',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General planning',
    });
    expect(gateway.create).toHaveBeenNthCalledWith(2, {
      ...OWNER,
      conversationId: 'conversation-sourcing',
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Sourcing planning',
    });
    await expect(service.create({
      ...OWNER,
      conversationId: 'conversation-invalid',
      runtime: 'codex_cli',
      agentKey: 'operator',
      title: 'Invalid Agent',
    }))
      .rejects.toThrow('conversation_agent_invalid');
  });

  it('shares a descriptor with another authenticated user in the same organization, while a fresh service fails closed for another organization', async () => {
    const gateway = readyGateway();
    const sameOrganizationUser = {
      organizationId: OWNER.organizationId,
      userId: '00000000-0000-4000-8000-000000000003',
    };
    const foreignOwner = {
      organizationId: '00000000-0000-4000-8000-000000000004',
      userId: '00000000-0000-4000-8000-000000000005',
    };
    vi.mocked(gateway.list).mockImplementation(async (owner) => (
      owner.organizationId === OWNER.organizationId ? [GENERAL_CONVERSATION] : []
    ));
    const firstApi = createService(gateway, () => 'turn-1');

    await firstApi.create({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      runtime: 'codex_cli',
      agentKey: null,
      title: GENERAL_CONVERSATION.title,
    });
    await expect(firstApi.create({
      ...sameOrganizationUser,
      conversationId: GENERAL_CONVERSATION.id,
      runtime: 'codex_cli',
      agentKey: null,
      title: GENERAL_CONVERSATION.title,
    })).resolves.toMatchObject({ id: GENERAL_CONVERSATION.id });
    const restartedApi = createService(gateway, () => 'turn-2');
    await expect(restartedApi.list(sameOrganizationUser)).resolves.toEqual([GENERAL_CONVERSATION]);
    await expect(restartedApi.list(foreignOwner)).resolves.toEqual([]);
    expect(gateway.create).toHaveBeenCalledTimes(2);
  });

  it('requires a supported model and effort for every explicit turn without a fallback', async () => {
    const gateway = readyGateway();
    const service = createService(gateway, () => 'turn-1');
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

  it('forwards the exact stored preference document while validating an explicit supported selection before dispatch', async () => {
    const gateway = readyGateway();
    const service = createService(gateway, () => 'turn-1') as unknown as {
      preferences(input: typeof OWNER): Promise<typeof PREFERENCES>;
      setPreference(input: typeof OWNER & {
        context: 'general';
        runtime: 'codex_cli';
        model: string;
        reasoningEffort: string;
      }): Promise<typeof PREFERENCES>;
    };

    await expect(service.preferences(OWNER)).resolves.toEqual(PREFERENCES);
    await expect(service.setPreference({
      ...OWNER,
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'xhigh',
    })).resolves.toEqual(PREFERENCES);
    expect(gateway.preferences).toHaveBeenCalledWith(OWNER);
    expect(gateway.setPreference).toHaveBeenCalledWith({
      ...OWNER,
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'xhigh',
    });

    await expect(service.setPreference({
      ...OWNER,
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'high',
    })).rejects.toThrow('conversation_reasoning_effort_unsupported');
    expect(gateway.setPreference).toHaveBeenCalledTimes(1);
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
    const service = createService(gateway, () => 'turn-1');
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
    const service = createService(gateway, () => 'turn-1');
    await service.list(OWNER);

    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'One explicit turn only.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    lifecycleSink?.({ kind: 'status', status: 'disconnected' });

    await expect(service.stop({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
  });

  it('retains exact stop ownership until its provider terminal arrives', async () => {
    const gateway = readyGateway();
    let lifecycleSink: ((event: { kind: 'status'; status: 'interrupted' }) => void) | undefined;
    vi.mocked(gateway.start).mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: (sink) => {
        lifecycleSink = sink as typeof lifecycleSink;
        return () => undefined;
      },
    });
    const service = createService(gateway, () => 'turn-1');
    await service.list(OWNER);
    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Keep the current turn fenced.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    await expect(service.stop({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    expect(gateway.interrupt).toHaveBeenCalledWith({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
    });
    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);

    lifecycleSink?.({ kind: 'status', status: 'interrupted' });
    await expect(service.stop({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
  });

  it('reports an organization conversation as running to another member and resolves the stored exact turn without browser-supplied coordinates', async () => {
    const gateway = readyGateway();
    let lifecycleSink: ((event: { kind: 'status'; status: 'completed' | 'interrupted' }) => void) | undefined;
    vi.mocked(gateway.start).mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: (sink) => {
        lifecycleSink = sink as typeof lifecycleSink;
        return () => undefined;
      },
    });
    const service = createService(gateway, () => 'turn-1');
    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Keep ownership exact.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    await expect(service.isRunning({
      ...OWNER,
      userId: '00000000-0000-4000-8000-000000000003',
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    await expect(service.stop({
      ...OWNER,
      userId: '00000000-0000-4000-8000-000000000003',
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    await expect(service.stop({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
    expect(gateway.interrupt).toHaveBeenCalledWith({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
    });
    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);

    lifecycleSink?.({ kind: 'status', status: 'interrupted' });

    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
    await expect(service.stop({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
    expect(gateway.interrupt).toHaveBeenCalledTimes(1);
  });

  it('hides an exact-stop target from a foreign organization before inspecting live-turn state', async () => {
    const gateway = readyGateway();
    vi.mocked(gateway.list).mockImplementation(async (owner) => (
      owner.organizationId === OWNER.organizationId ? [GENERAL_CONVERSATION] : []
    ));
    const service = createService(gateway, () => 'turn-1');
    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
      message: 'Keep this organization-scoped.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    await expect(service.stop({
      ...OWNER,
      organizationId: 'foreign-org',
      conversationId: GENERAL_CONVERSATION.id,
    })).rejects.toThrow('conversation_not_found');
    expect(gateway.interrupt).not.toHaveBeenCalled();
  });

  it('rejects a second start for an active organization conversation instead of overwriting the exact live turn', async () => {
    const gateway = readyGateway();
    const service = createService(gateway, () => 'generated-turn');
    const firstStart = {
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Keep the first provider turn authoritative.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    };

    await service.start({ ...firstStart, turnId: 'turn-1' });
    await expect(service.start({
      ...firstStart,
      userId: '00000000-0000-4000-8000-000000000003',
      turnId: 'turn-2',
    })).rejects.toThrow('conversation_turn_live');
    expect(gateway.start).toHaveBeenCalledTimes(1);
    await expect(service.stop({
      ...OWNER,
      userId: '00000000-0000-4000-8000-000000000003',
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    expect(gateway.interrupt).toHaveBeenCalledWith({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      turnId: 'turn-1',
    });
  });

  it('rejects deletion of a live organization conversation before Gateway or SQLite history mutation', async () => {
    const gateway = readyGateway();
    const eventHistory = { delete: vi.fn() };
    const service = createService(gateway, () => 'turn-1', eventHistory);
    const coordinates = { ...OWNER, conversationId: GENERAL_CONVERSATION.id };

    await service.start({
      ...coordinates,
      turnId: 'turn-1',
      message: 'Do not split a live provider turn from its history.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });

    await expect(service.delete(coordinates)).rejects.toThrow('conversation_turn_live');
    expect(gateway.delete).not.toHaveBeenCalled();
    expect(eventHistory.delete).not.toHaveBeenCalled();
  });

  it('does not let a stale terminal clear a successor turn for the same exact owner conversation', async () => {
    const gateway = readyGateway();
    const lifecycleSinks: Array<(event: { kind: 'status'; status: 'completed' }) => void> = [];
    vi.mocked(gateway.start)
      .mockReturnValueOnce({
        turnId: 'turn-1',
        ready: Promise.resolve(),
        subscribe: (sink) => {
          lifecycleSinks.push(sink as (event: { kind: 'status'; status: 'completed' }) => void);
          return () => undefined;
        },
      })
      .mockReturnValueOnce({
        turnId: 'turn-2',
        ready: Promise.resolve(),
        subscribe: (sink) => {
          lifecycleSinks.push(sink as (event: { kind: 'status'; status: 'completed' }) => void);
          return () => undefined;
        },
      });
    const service = createService(gateway, () => 'generated-turn');
    const start = {
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'One active turn at a time.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    };

    await service.start({ ...start, turnId: 'turn-1' });
    lifecycleSinks[0]?.({ kind: 'status', status: 'completed' });
    await service.start({ ...start, turnId: 'turn-2' });
    lifecycleSinks[0]?.({ kind: 'status', status: 'completed' });

    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(true);
    lifecycleSinks[1]?.({ kind: 'status', status: 'completed' });
    await expect(service.isRunning({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
  });

  it('retries exact local SQLite cleanup after an already-absent Gateway delete while preserving not-found', async () => {
    const gateway = readyGateway();
    vi.mocked(gateway.delete)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AgentOsRuntimeError('conversation_not_found'));
    const eventHistory = {
      delete: vi.fn()
        .mockImplementationOnce(() => { throw new Error('sqlite_temporarily_unavailable'); })
        .mockImplementationOnce(() => undefined),
    };
    const service = createService(gateway, () => 'turn-1', eventHistory);
    const coordinates = { ...OWNER, conversationId: GENERAL_CONVERSATION.id };

    await expect(service.delete(coordinates)).rejects.toThrow('sqlite_temporarily_unavailable');
    await expect(service.delete(coordinates)).rejects.toThrow('conversation_not_found');

    expect(gateway.delete).toHaveBeenCalledTimes(2);
    expect(eventHistory.delete).toHaveBeenNthCalledWith(1, coordinates, { conversationId: GENERAL_CONVERSATION.id });
    expect(eventHistory.delete).toHaveBeenNthCalledWith(2, coordinates, { conversationId: GENERAL_CONVERSATION.id });
    expect(gateway.delete.mock.invocationCallOrder[0]).toBeLessThan(eventHistory.delete.mock.invocationCallOrder[0]);
    expect(gateway.delete.mock.invocationCallOrder[1]).toBeLessThan(eventHistory.delete.mock.invocationCallOrder[1]);
  });

  it('does not turn a foreign exact Gateway not-found into a successful delete while only cleaning that organization namespace', async () => {
    const gateway = readyGateway();
    vi.mocked(gateway.delete).mockRejectedValue(new AgentOsRuntimeError('conversation_not_found'));
    const eventHistory = { delete: vi.fn() };
    const service = createService(gateway, () => 'turn-1', eventHistory);
    const foreignCoordinates = {
      ...OWNER,
      organizationId: '00000000-0000-4000-8000-000000000099',
      conversationId: GENERAL_CONVERSATION.id,
    };

    await expect(service.delete(foreignCoordinates)).rejects.toThrow('conversation_not_found');
    expect(eventHistory.delete).toHaveBeenCalledWith(foreignCoordinates, {
      conversationId: GENERAL_CONVERSATION.id,
    });
  });

  it('does not clear local canonical history when Gateway deletion fails for anything other than exact already-absent', async () => {
    const gateway = readyGateway();
    vi.mocked(gateway.delete)
      .mockRejectedValueOnce(new Error('gateway_delete_failed'))
      .mockResolvedValueOnce(undefined);
    const eventHistory = { delete: vi.fn() };
    const service = createService(gateway, () => 'turn-1', eventHistory);
    const coordinates = { ...OWNER, conversationId: GENERAL_CONVERSATION.id };

    await expect(service.delete(coordinates)).rejects.toThrow('gateway_delete_failed');
    await expect(service.delete(coordinates)).resolves.toBeUndefined();

    expect(eventHistory.delete).toHaveBeenCalledTimes(1);
    expect(gateway.delete).toHaveBeenCalledTimes(2);
  });

  it('forwards every Gateway command only after the owner fence is established', async () => {
    const gateway = readyGateway();
    let lifecycleSink: ((event: { kind: 'status'; status: 'completed' }) => void) | undefined;
    vi.mocked(gateway.start).mockReturnValue({
      turnId: 'turn-1',
      ready: Promise.resolve(),
      subscribe: (sink) => {
        lifecycleSink = sink as typeof lifecycleSink;
        return () => undefined;
      },
    });
    const service = createService(gateway, () => 'turn-1');
    await service.list(OWNER);

    await service.rename({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, title: 'Renamed' });
    await service.start({
      ...OWNER,
      conversationId: GENERAL_CONVERSATION.id,
      message: 'Start one turn.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
    await service.stop({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
    lifecycleSink?.({ kind: 'status', status: 'completed' });
    await service.delete({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });

    expect(gateway.rename).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, title: 'Renamed' });
    expect(gateway.interrupt).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id, turnId: 'turn-1' });
    expect(gateway.delete).toHaveBeenCalledWith({ ...OWNER, conversationId: GENERAL_CONVERSATION.id });
    await expect(service.stop({
      ...OWNER,
      organizationId: 'foreign-org',
      conversationId: GENERAL_CONVERSATION.id,
    })).resolves.toBe(false);
  });
});
