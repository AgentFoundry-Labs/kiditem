import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATEWAY_RUNTIME_TRAIN } from '@kiditem/shared/agent-runtime';
import { GatewayControlClient } from '../control/gateway-control.client';
import { GatewayCommandDispatcher } from '../control/gateway-command-dispatcher';
import { GatewayEventOutbox } from '../control/gateway-event-outbox';
import { NativeGatewayControlSession } from '../control/native-gateway-control-session';
import { ConversationPreferenceStore } from '../conversation/conversation-preference.store';
import { ExecutionBindingRegistry } from '../../../server/src/agent-os/adapter/out/runtime/gateway/execution-binding.registry';
import { GatewayCommandQueue } from '../../../server/src/agent-os/adapter/out/runtime/gateway/gateway-command.queue';
import { GatewayCommandResponseBroker } from '../../../server/src/agent-os/adapter/out/runtime/gateway/gateway-command-response.broker';
import { GatewayEventHandlerService } from '../../../server/src/agent-os/adapter/out/runtime/gateway/gateway-event-handler.service';
import { GatewayInstallationBearerService } from '../../../server/src/agent-os/adapter/out/runtime/gateway/gateway-installation-bearer.service';
import { GatewayReadinessService } from '../../../server/src/agent-os/adapter/out/runtime/gateway/gateway-readiness.service';
import { GatewayControlController } from '../../../server/src/agent-os/adapter/in/http/runtime/gateway-control.controller';

const TOKEN = 'A'.repeat(43);
const GATEWAY_INSTANCE_ID = 'gateway-loopback-1';
const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
};
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Gateway ↔ Nest loopback', () => {
  it('polls strict Gateway commands, delivers the correlated provider result before transport ack retirement, and stores exact readiness', async () => {
    const bindings = new ExecutionBindingRegistry();
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const readiness = new GatewayReadinessService();
    const queue = new GatewayCommandQueue({
      bindings,
      installationId: 'installation-loopback',
      longPollMs: 0,
      onTransientClear: () => { broker.disconnect(); readiness.clear(); },
    });
    const events = new GatewayEventHandlerService({ queue, readiness, broker });
    const controller = new GatewayControlController(
      new GatewayInstallationBearerService({ token: TOKEN, installationId: 'installation-loopback' }),
      queue,
      events,
      readiness,
    );
    const client = new GatewayControlClient({
      controlOrigin: 'http://127.0.0.1:4000', token: TOKEN, fetch: loopbackFetch(controller),
    });
    const poll = { kind: 'poll' as const, gatewayInstanceId: GATEWAY_INSTANCE_ID, platform: 'macos' as const, runtimeTrain: GATEWAY_RUNTIME_TRAIN };

    await expect(client.poll(poll)).resolves.toEqual({ commands: [] });
    const command = { kind: 'conversation.list' as const, commandId: broker.nextCommandId() };
    const result = broker.begin<unknown[]>({ ...OWNER, command });
    queue.enqueue(command);

    const outbox = new GatewayEventOutbox({ gatewayInstanceId: GATEWAY_INSTANCE_ID, redactionTokens: [TOKEN] });
    const dispatcher = new GatewayCommandDispatcher({
      gateway: { list: async () => [], create: async () => undefined, history: async () => [], rename: async () => undefined, delete: async () => undefined, startTurn: async () => undefined, sendInput: async () => undefined, interrupt: async () => undefined },
      outbox,
      preferences: { read: async () => ({ schemaVersion: 1 as const, contexts: {} }), set: async () => ({ schemaVersion: 1 as const, contexts: {} }) },
    });
    const batch = await client.poll(poll);
    expect(batch?.commands).toEqual([command]);
    await dispatcher.dispatch(batch!.commands[0]!);
    outbox.enqueue({
      kind: 'gateway.readiness',
      readiness: [
        { runtime: 'codex_cli', ready: true, readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' } },
        { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
      ],
    });
    await outbox.flush((body) => client.postEventBody(body));

    await expect(result.result).resolves.toEqual([]);
    expect(readiness.snapshot()).toMatchObject({
      gatewayInstanceId: GATEWAY_INSTANCE_ID,
      readiness: [expect.objectContaining({ runtime: 'codex_cli', ready: true }), expect.objectContaining({ runtime: 'claude_cli', ready: false })],
    });
  });

  it('resolves a browser-reserved create through the real Nest control loopback before its transport acknowledgement', async () => {
    const bindings = new ExecutionBindingRegistry();
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const readiness = new GatewayReadinessService();
    const queue = new GatewayCommandQueue({
      bindings,
      installationId: 'installation-loopback',
      longPollMs: 0,
      onTransientClear: () => { broker.disconnect(); readiness.clear(); },
    });
    const eventHandler = new GatewayEventHandlerService({ queue, readiness, broker });
    const controller = new GatewayControlController(
      new GatewayInstallationBearerService({ token: TOKEN, installationId: 'installation-loopback' }),
      queue,
      eventHandler,
      readiness,
    );
    const client = new GatewayControlClient({
      controlOrigin: 'http://127.0.0.1:4000', token: TOKEN, fetch: loopbackFetch(controller),
    });
    const poll = {
      kind: 'poll' as const,
      gatewayInstanceId: 'gateway-loopback-create',
      platform: 'macos' as const,
      runtimeTrain: GATEWAY_RUNTIME_TRAIN,
    };
    const conversationId = 'browser-reserved-conversation-1';
    const summary = {
      id: conversationId,
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: 'General chat',
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    };
    const create = vi.fn(async () => summary);
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: poll.gatewayInstanceId, redactionTokens: [TOKEN] });
    const dispatcher = new GatewayCommandDispatcher({
      gateway: {
        list: async () => [],
        create,
        history: async () => [],
        rename: async () => undefined,
        delete: async () => undefined,
        startTurn: async () => undefined,
        sendInput: async () => undefined,
        interrupt: async () => undefined,
      },
      outbox,
      preferences: { read: async () => ({ schemaVersion: 1 as const, contexts: {} }), set: async () => ({ schemaVersion: 1 as const, contexts: {} }) },
    });

    await expect(client.poll(poll)).resolves.toEqual({ commands: [] });
    const command = {
      kind: 'conversation.create' as const,
      commandId: broker.nextCommandId(),
      conversationId,
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: summary.title,
    };
    const result = broker.begin<typeof summary>({ ...OWNER, command });
    queue.enqueue(command);

    const batch = await client.poll(poll);
    expect(batch?.commands).toEqual([command]);
    await dispatcher.dispatch(batch!.commands[0]!);
    const body = outbox.peekBody();
    if (!body) throw new Error('gateway_loopback_create_event_missing');
    expect(events(body)).toEqual([
      { kind: 'conversation.created', commandId: command.commandId, conversation: summary },
      { kind: 'command.ack', commandId: command.commandId },
    ]);

    const resolved = expect(result.result).resolves.toEqual(summary);
    await outbox.flush((eventBody) => client.postEventBody(eventBody));
    await resolved;

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      conversationId,
      runtime: 'codex_cli',
      agentKey: null,
      title: summary.title,
    });
  });

  it('round-trips installation-local preference commands without putting authenticated owner data in the file or Gateway events', async () => {
    const root = await fixtureRoot();
    const bindings = new ExecutionBindingRegistry();
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const readiness = new GatewayReadinessService();
    const queue = new GatewayCommandQueue({
      bindings,
      installationId: 'installation-loopback',
      longPollMs: 0,
      onTransientClear: () => { broker.disconnect(); readiness.clear(); },
    });
    const controller = new GatewayControlController(
      new GatewayInstallationBearerService({ token: TOKEN, installationId: 'installation-loopback' }),
      queue,
      new GatewayEventHandlerService({ queue, readiness, broker }),
      readiness,
    );
    const client = new GatewayControlClient({ controlOrigin: 'http://127.0.0.1:4000', token: TOKEN, fetch: loopbackFetch(controller) });
    const poll = { kind: 'poll' as const, gatewayInstanceId: 'gateway-loopback-preferences', platform: 'macos' as const, runtimeTrain: GATEWAY_RUNTIME_TRAIN };
    const preferences = new ConversationPreferenceStore({ stateRoot: root, platform: 'macos' });
    const outbox = new GatewayEventOutbox({ gatewayInstanceId: poll.gatewayInstanceId, redactionTokens: [TOKEN] });
    const dispatcher = new GatewayCommandDispatcher({
      gateway: { list: async () => [], create: async () => undefined, history: async () => [], rename: async () => undefined, delete: async () => undefined, startTurn: async () => undefined, sendInput: async () => undefined, interrupt: async () => undefined },
      outbox,
      preferences,
    });

    await client.poll(poll);

    const firstGet = { kind: 'conversation.preferences.get' as const, commandId: broker.nextCommandId() };
    const firstGetBody = await dispatchAndPeek({ client, dispatcher, outbox, poll, queue, command: firstGet });
    expect(events(firstGetBody)).toEqual([
      { kind: 'conversation.preferences.loaded', commandId: firstGet.commandId, preferences: { schemaVersion: 1, contexts: {} } },
      { kind: 'command.ack', commandId: firstGet.commandId },
    ]);
    await outbox.flush((body) => client.postEventBody(body));

    const set = {
      kind: 'conversation.preferences.set' as const,
      commandId: broker.nextCommandId(),
      context: 'general' as const,
      runtime: 'codex_cli' as const,
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
    };
    const setBody = await dispatchAndPeek({ client, dispatcher, outbox, poll, queue, command: set });
    expect(events(setBody)).toEqual([
      {
        kind: 'conversation.preferences.updated', commandId: set.commandId, preferences: {
          schemaVersion: 1,
          contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } } },
        },
      },
      { kind: 'command.ack', commandId: set.commandId },
    ]);
    expect(setBody).not.toContain(OWNER.organizationId);
    expect(setBody).not.toContain(OWNER.initiatingUserId);
    await outbox.flush((body) => client.postEventBody(body));

    const secondGet = { kind: 'conversation.preferences.get' as const, commandId: broker.nextCommandId() };
    const secondGetBody = await dispatchAndPeek({ client, dispatcher, outbox, poll, queue, command: secondGet });
    expect(events(secondGetBody)[0]).toEqual({
      kind: 'conversation.preferences.loaded', commandId: secondGet.commandId, preferences: {
        schemaVersion: 1,
        contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } } },
      },
    });
    await outbox.flush((body) => client.postEventBody(body));

    const raw = await readFile(join(root, 'conversation-preferences.json'), 'utf8');
    expect(raw).not.toContain(OWNER.organizationId);
    expect(raw).not.toContain(OWNER.initiatingUserId);
    expect(raw).not.toContain('providerConversationRef');
    expect(raw).not.toContain('executionBinding');
  });

  it('lets a normal empty 25-second Nest long-poll return before the Gateway client deadline', async () => {
    vi.useFakeTimers();
    try {
      const bindings = new ExecutionBindingRegistry();
      const broker = new GatewayCommandResponseBroker();
      const readiness = new GatewayReadinessService();
      const queue = new GatewayCommandQueue({
        bindings,
        installationId: 'installation-loopback',
        onTransientClear: () => { broker.disconnect(); readiness.clear(); },
      });
      const controller = new GatewayControlController(
        new GatewayInstallationBearerService({ token: TOKEN, installationId: 'installation-loopback' }),
        queue,
        new GatewayEventHandlerService({ queue, readiness, broker }),
        readiness,
      );
      const client = new GatewayControlClient({ controlOrigin: 'http://127.0.0.1:4000', token: TOKEN, fetch: loopbackFetch(controller) });
      const pending = client.poll({ kind: 'poll', gatewayInstanceId: 'gateway-loopback-long-poll', platform: 'macos', runtimeTrain: GATEWAY_RUNTIME_TRAIN });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(25_000);
      await expect(pending).resolves.toEqual({ commands: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps an API-restarted event sequence to terminal loopback loss and closes the native session instead of retrying forever', async () => {
    const bindings = new ExecutionBindingRegistry();
    const broker = new GatewayCommandResponseBroker({ timeoutMs: 1_000 });
    const readiness = new GatewayReadinessService();
    const queue = new GatewayCommandQueue({
      bindings,
      installationId: 'installation-loopback',
      longPollMs: 0,
      onTransientClear: () => { broker.disconnect(); readiness.clear(); },
    });
    const bearer = new GatewayInstallationBearerService({ token: TOKEN, installationId: 'installation-loopback' });
    let controller = new GatewayControlController(bearer, queue, new GatewayEventHandlerService({ queue, readiness, broker }), readiness);
    const client = new GatewayControlClient({
      controlOrigin: 'http://127.0.0.1:4000', token: TOKEN, fetch: loopbackFetch(() => controller),
    });
    const poll = { kind: 'poll' as const, gatewayInstanceId: 'gateway-loopback-restart', platform: 'macos' as const, runtimeTrain: GATEWAY_RUNTIME_TRAIN };
    await client.poll(poll);

    const outbox = new GatewayEventOutbox({ gatewayInstanceId: poll.gatewayInstanceId, redactionTokens: [TOKEN] });
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-1' });
    await outbox.flush((body) => client.postEventBody(body));

    // A Nest restart retains no process-memory event sequence. The Gateway's
    // next stable outbox batch must become terminal control loss, not 500/retry.
    controller = new GatewayControlController(bearer, queue, new GatewayEventHandlerService({ queue, readiness, broker }), readiness);
    outbox.enqueue({ kind: 'command.ack', commandId: 'command-2' });
    const staleBody = outbox.peekBody();
    if (!staleBody) throw new Error('gateway_loopback_outbox_missing');
    await expect(client.postEventBody(staleBody)).rejects.toMatchObject({ status: 409 });

    const dispatcher = { dispatch: vi.fn(async () => undefined), clear: vi.fn() };
    const lost = vi.fn();
    const session = new NativeGatewayControlSession({ client, dispatcher, outbox, poll, onPollLoss: lost });
    await expect(session.run()).rejects.toThrow('gateway_control_lost');
    expect(dispatcher.clear).toHaveBeenCalledOnce();
    expect(lost).toHaveBeenCalledOnce();
  });
});

function loopbackFetch(controllerSource: GatewayControlController | (() => GatewayControlController)): typeof fetch {
  return async (url, init) => {
    const controller = typeof controllerSource === 'function' ? controllerSource() : controllerSource;
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body ?? '{}'));
    const headers = new Headers(init?.headers);
    const request = { headers: { authorization: headers.get('authorization') ?? undefined }, once: () => undefined, off: () => undefined };
    try {
      if (path.endsWith('/commands:poll')) {
        const response = { writableEnded: false, once: () => undefined };
        return new Response(JSON.stringify(await controller.poll(body, request as never, response as never)), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path.endsWith('/events')) {
        return new Response(JSON.stringify(await controller.event(body, request as never)), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
      return new Response(null, { status });
    }
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-loopback-'));
  roots.push(root);
  return root;
}

async function dispatchAndPeek(input: Readonly<{
  client: GatewayControlClient;
  dispatcher: GatewayCommandDispatcher;
  outbox: GatewayEventOutbox;
  poll: { kind: 'poll'; gatewayInstanceId: string; platform: 'macos'; runtimeTrain: typeof GATEWAY_RUNTIME_TRAIN };
  queue: GatewayCommandQueue;
  command: { kind: 'conversation.preferences.get'; commandId: string } | {
    kind: 'conversation.preferences.set'; commandId: string; context: 'general'; runtime: 'codex_cli'; model: string; reasoningEffort: string;
  };
}>): Promise<string> {
  input.queue.enqueue(input.command);
  const batch = await input.client.poll(input.poll);
  const command = batch.commands[0];
  if (!command) throw new Error('gateway_loopback_command_missing');
  await input.dispatcher.dispatch(command);
  const body = input.outbox.peekBody();
  if (!body) throw new Error('gateway_loopback_preferences_event_missing');
  return body;
}

function events(body: string): Array<Record<string, unknown>> {
  return (JSON.parse(body) as { events: Array<Record<string, unknown>> }).events;
}
