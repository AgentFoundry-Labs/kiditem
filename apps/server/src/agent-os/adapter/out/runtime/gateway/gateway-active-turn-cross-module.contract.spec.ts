import { describe, expect, it } from 'vitest';
import {
  GATEWAY_RUNTIME_TRAIN,
  type GatewayEvent,
  type GatewayProviderReadiness,
} from '@kiditem/shared/agent-runtime';
import { ConversationService } from '../../../../application/service/conversation.service';
import { GatewayConversationAdapter } from './gateway-conversation.adapter';
import {
  GatewayCommandQueue,
  GatewayProcessRegistrationMissingError,
} from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayEventHandlerService } from './gateway-event-handler.service';
import {
  GatewayMcpActiveTurnInactiveError,
  GatewayMcpRuntimeRegistry,
} from './gateway-mcp-runtime.registry';
import { GatewayReadinessService } from './gateway-readiness.service';
import type { GatewayConversationPort } from '../../../../application/port/out/gateway-conversation.port';

const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
};

const CONVERSATION = {
  id: 'conversation-1',
  runtime: 'codex_cli' as const,
  agentKey: null,
  title: 'Gateway lifecycle contract',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
};

const POLL = {
  kind: 'poll' as const,
  gatewayInstanceId: 'gateway-1',
  platform: 'macos' as const,
  mcpTransportToken: 'A'.repeat(43),
  runtimeTrain: GATEWAY_RUNTIME_TRAIN,
};

const READY: GatewayProviderReadiness[] = [
  {
    runtime: 'codex_cli',
    ready: true,
    readiness: {
      runtime: 'codex_cli',
      version: '0.149.1',
      models: ['gpt-5.6-terra'],
      reasoningEfforts: ['max'],
      modelReasoningEfforts: [{ model: 'gpt-5.6-terra', reasoningEfforts: ['max'] }],
      loginVerified: true,
      mcpProtocolRevision: '2026-07-28',
    },
  },
  { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
];

interface RuntimeLane {
  readonly registry: GatewayMcpRuntimeRegistry;
  readonly queue: GatewayCommandQueue;
  readonly broker: GatewayCommandResponseBroker;
  readonly handler: GatewayEventHandlerService;
  readonly service: ConversationService;
  eventSeq: number;
}

describe('Gateway active-turn cross-module contract', () => {
  it('keeps Conversation state and MCP authority aligned through interrupt acknowledgement, exact terminal, and a stale terminal', async () => {
    const lane = createLane();
    await startTurn(lane, 'turn-1');

    const firstActive = lane.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id);
    expect(firstActive).toMatchObject({
      organizationId: OWNER.organizationId,
      initiatingUserId: OWNER.userId,
      conversationId: CONVERSATION.id,
      turnId: 'turn-1',
    });
    await expect(lane.service.isRunning(coordinates())).resolves.toBe(true);

    const stop = lane.service.stop(coordinates());
    const interrupt = await pullCommand(lane, 'turn.interrupt');
    emit(lane, [{ kind: 'command.ack', commandId: interrupt.commandId }]);
    await expect(stop).resolves.toBe(true);

    await expect(lane.service.isRunning(coordinates())).resolves.toBe(true);
    expect(lane.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id).executionId).toBe(firstActive.executionId);

    emit(lane, [{
      kind: 'turn.event',
      conversationId: CONVERSATION.id,
      turnId: 'turn-1',
      event: { kind: 'status', status: 'interrupted' },
    }]);

    await expect(lane.service.isRunning(coordinates())).resolves.toBe(false);
    expectInactive(lane);

    await startTurn(lane, 'turn-2');
    const successor = lane.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id);
    expect(successor.executionId).not.toBe(firstActive.executionId);

    emit(lane, [{
      kind: 'turn.terminal',
      conversationId: CONVERSATION.id,
      turnId: 'turn-1',
      status: 'completed',
    }]);

    await expect(lane.service.isRunning(coordinates())).resolves.toBe(true);
    expect(lane.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id).executionId).toBe(successor.executionId);

    emit(lane, [{
      kind: 'turn.terminal',
      conversationId: CONVERSATION.id,
      turnId: 'turn-2',
      status: 'completed',
    }]);

    await expect(lane.service.isRunning(coordinates())).resolves.toBe(false);
    expectInactive(lane);
  });

  it('requires one Gateway re-registration after an API restart and never lets an old terminal release the next turn', async () => {
    const beforeRestart = createLane();
    await startTurn(beforeRestart, 'turn-before-restart');
    const beforeRestartExecution = beforeRestart.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id).executionId;

    const afterRestart = createLane({ registerProcess: false });
    const replayedTerminal = {
      gatewayInstanceId: POLL.gatewayInstanceId,
      eventSeq: 7,
      events: [{
        kind: 'turn.terminal' as const,
        conversationId: CONVERSATION.id,
        turnId: 'turn-before-restart',
        status: 'disconnected' as const,
      }],
    };

    expect(() => afterRestart.handler.handle(replayedTerminal)).toThrow(GatewayProcessRegistrationMissingError);
    expect(afterRestart.queue.claim(POLL)).toBe(true);
    expect(afterRestart.handler.handle(replayedTerminal)).toEqual({ eventSeq: 7, accepted: true });
    afterRestart.eventSeq = 7;

    await expect(afterRestart.service.isRunning(coordinates())).resolves.toBe(false);
    expectInactive(afterRestart);

    await startTurn(afterRestart, 'turn-after-restart');
    const afterRestartExecution = afterRestart.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id).executionId;
    expect(afterRestartExecution).not.toBe(beforeRestartExecution);

    emit(afterRestart, [{
      kind: 'turn.terminal',
      conversationId: CONVERSATION.id,
      turnId: 'turn-before-restart',
      status: 'disconnected',
    }]);

    await expect(afterRestart.service.isRunning(coordinates())).resolves.toBe(true);
    expect(afterRestart.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id).executionId).toBe(afterRestartExecution);

    emit(afterRestart, [{
      kind: 'turn.terminal',
      conversationId: CONVERSATION.id,
      turnId: 'turn-after-restart',
      status: 'completed',
    }]);

    await expect(afterRestart.service.isRunning(coordinates())).resolves.toBe(false);
    expectInactive(afterRestart);
    beforeRestart.broker.disconnect();
  });
});

function createLane(options: Readonly<{ registerProcess?: boolean }> = {}): RuntimeLane {
  const registry = new GatewayMcpRuntimeRegistry();
  const broker = new GatewayCommandResponseBroker({ timeoutMs: 5_000 });
  const readiness = new GatewayReadinessService();
  readiness.update(POLL.gatewayInstanceId, READY);
  const queue = new GatewayCommandQueue({
    runtime: registry,
    installationId: 'installation-1',
    longPollMs: 0,
    onTransientClear: () => broker.disconnect(),
  });
  const handler = new GatewayEventHandlerService({ queue, readiness, broker });
  const adapter = new GatewayConversationAdapter(queue, broker, readiness);
  const gateway: GatewayConversationPort = {
    list: async (owner) => owner.organizationId === OWNER.organizationId ? [CONVERSATION] : [],
    create: adapter.create.bind(adapter),
    preferences: adapter.preferences.bind(adapter),
    setPreference: adapter.setPreference.bind(adapter),
    rename: adapter.rename.bind(adapter),
    delete: adapter.delete.bind(adapter),
    start: adapter.start.bind(adapter),
    interrupt: adapter.interrupt.bind(adapter),
    readiness: adapter.readiness.bind(adapter),
  };
  const service = new ConversationService(
    gateway,
    { delete: () => undefined },
    () => CONVERSATION.id,
    () => 'generated-turn',
  );
  if (options.registerProcess !== false) queue.claim(POLL);
  return { registry, queue, broker, handler, service, eventSeq: 0 };
}

async function startTurn(lane: RuntimeLane, turnId: string): Promise<void> {
  const live = await lane.service.start({
    ...coordinates(),
    turnId,
    message: `Run ${turnId}.`,
    model: 'gpt-5.6-terra',
    reasoningEffort: 'max',
  });
  const command = await pullCommand(lane, 'turn.start');
  emit(lane, [
    { kind: 'command.ack', commandId: command.commandId },
    {
      kind: 'turn.event',
      conversationId: CONVERSATION.id,
      turnId,
      event: { kind: 'status', status: 'started' },
    },
  ]);
  await live.ready;
}

async function pullCommand<TKind extends 'turn.start' | 'turn.interrupt'>(
  lane: RuntimeLane,
  expectedKind: TKind,
): Promise<Extract<Awaited<ReturnType<GatewayCommandQueue['poll']>>['commands'][number], { kind: TKind }>> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const batch = await lane.queue.poll(POLL);
    const command = batch.commands.find((candidate) => candidate.kind === expectedKind);
    if (command && command.kind === expectedKind) return command as Extract<typeof command, { kind: TKind }>;
    await Promise.resolve();
  }
  throw new Error(`Expected ${expectedKind} command.`);
}

function emit(lane: RuntimeLane, events: GatewayEvent[]): void {
  lane.eventSeq += 1;
  lane.handler.handle({
    gatewayInstanceId: POLL.gatewayInstanceId,
    eventSeq: lane.eventSeq,
    events,
  });
}

function coordinates() {
  return { ...OWNER, conversationId: CONVERSATION.id };
}

function expectInactive(lane: RuntimeLane): void {
  expect(() => lane.registry.resolveActive(POLL.mcpTransportToken, CONVERSATION.id)).toThrow(GatewayMcpActiveTurnInactiveError);
}
