import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationDescriptorStore } from './conversation-descriptor.store';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ConversationGateway', () => {
  it('maps an opaque descriptor to one fixed provider conversation and requires an explicitly supported model and effort', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: await fixtureRoot(), platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });

    const created = await gateway.create({ conversationId: 'browser-conversation-1', runtime: 'codex_cli', agentKey: 'sourcing', title: 'Supplier research' });
    expect(created).toEqual({
      id: 'browser-conversation-1',
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Supplier research',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    });
    expect(JSON.stringify(created)).not.toContain('provider-thread-1');
    expect(provider.created).toEqual([expect.objectContaining({
      title: 'Supplier research',
      instructionProfile: expect.objectContaining({
        selectedAgentKey: 'sourcing',
        selectedInstructions: expect.stringContaining('KidItem Sourcing Agent'),
        delegationProfiles: expect.arrayContaining([
          expect.objectContaining({ key: 'advertising', instructions: expect.stringContaining('KidItem Advertising Agent') }),
        ]),
      }),
    })]);

    await gateway.startTurn({
      conversationId: created.id,
      turnId: 'turn-1',
      message: 'Find current supplier inventory.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      executionBinding: 'binding-1',
      onEvent: () => undefined,
    });
    expect(provider.started).toEqual([{
      providerConversationRef: 'provider-thread-1',
      turnId: 'turn-1',
      message: 'Find current supplier inventory.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      executionBinding: 'binding-1',
      instructionProfile: expect.objectContaining({
        selectedAgentKey: 'sourcing',
        selectedInstructions: expect.stringContaining('KidItem Sourcing Agent'),
        delegationProfiles: expect.arrayContaining([
          expect.objectContaining({ key: 'supply', instructions: expect.stringContaining('KidItem Supply Agent') }),
        ]),
      }),
    }]);

    await expect(gateway.startTurn({
      conversationId: created.id,
      turnId: 'turn-2',
      message: 'Try an unsupported model.',
      model: 'silent-default',
      reasoningEffort: 'medium',
      executionBinding: 'binding-2',
      onEvent: () => undefined,
    })).rejects.toThrow('gateway_model_unsupported');
    await expect(gateway.startTurn({
      conversationId: created.id,
      turnId: 'turn-3',
      message: 'Try an unsupported effort.',
      model: 'gpt-5.6',
      reasoningEffort: 'none',
      executionBinding: 'binding-3',
      onEvent: () => undefined,
    })).rejects.toThrow('gateway_reasoning_effort_unsupported');
  });

  it('replays sequential and concurrent canonical creates by the requested public conversation ID', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const claude = new FakeProvider('claude_cli');
    const createGate = deferred<void>();
    const createStarted = deferred<void>();
    provider.createGate = createGate.promise;
    provider.createStarted = () => createStarted.resolve();
    const command = {
      conversationId: 'browser-idempotent-conversation',
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: 'General chat',
    };
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: claude },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });

    const first = gateway.create(command);
    await createStarted.promise;
    const concurrent = gateway.create({ ...command });
    await expect(gateway.create({ ...command, title: 'Changed during create' }))
      .rejects.toThrow('gateway_conversation_create_conflict');
    expect(provider.created).toHaveLength(1);
    createGate.resolve();

    const expected = {
      id: 'browser-idempotent-conversation',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'General chat',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    };
    await expect(first).resolves.toEqual(expected);
    await expect(concurrent).resolves.toEqual(expected);
    await expect(gateway.create(command)).resolves.toEqual(expected);
    expect(provider.created).toHaveLength(1);

    await expect(gateway.create({ ...command, runtime: 'claude_cli' }))
      .rejects.toThrow('gateway_conversation_create_conflict');
    await expect(gateway.create({ ...command, agentKey: 'sourcing' }))
      .rejects.toThrow('gateway_conversation_create_conflict');
    await expect(gateway.create({ ...command, title: 'Changed after create' }))
      .rejects.toThrow('gateway_conversation_create_conflict');
    expect(provider.created).toHaveLength(1);
    expect(claude.created).toHaveLength(0);

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: claude },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });
    await expect(restarted.create(command)).resolves.toEqual(expected);
    expect(provider.created).toHaveLength(1);
  });

  it('replays the immutable original create title after a display rename while rejecting create-title drift', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const original = {
      conversationId: 'browser-renamed-idempotent-conversation',
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: 'Original supplier research',
    };
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });

    await gateway.create(original);
    const renamed = await gateway.rename(original.conversationId, 'Renamed supplier research');

    await expect(gateway.create(original)).resolves.toEqual(renamed);
    await expect(gateway.create({ ...original, title: 'Conflicting create title' }))
      .rejects.toThrow('gateway_conversation_create_conflict');

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:02:00.000Z'),
    });
    await expect(restarted.create(original)).resolves.toEqual(renamed);
    expect(provider.created).toHaveLength(1);
  });

  it('deletes a just-created provider conversation when the descriptor write fails without exposing its provider ref', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({
        stateRoot: await fixtureRoot(),
        platform: 'macos',
        filesystem: descriptorWriteFailureFilesystem() as never,
      }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });

    let failure: unknown;
    try {
      await gateway.create({ conversationId: 'browser-write-failure', runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ message: 'gateway_descriptor_create_failed' });
    expect(JSON.stringify(failure)).not.toContain('provider-thread-1');
    expect(provider.deleted).toEqual(['provider-thread-1']);
  });

  it('reads history from the provider after a Gateway restart without copying a provider ref into public output', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const descriptors = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const first = new ConversationGateway({
      descriptors,
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    await first.create({ conversationId: 'browser-conversation-2', runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    provider.messages = [{ id: 'message-1', role: 'assistant', content: 'Provider-native history.', createdAt: '2026-08-23T00:01:00.000Z' }];

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:02:00.000Z'),
    });
    const history = await restarted.history('browser-conversation-2');

    expect(history).toEqual(provider.messages);
    expect(provider.historyRefs).toEqual(['provider-thread-1']);
    expect(JSON.stringify(history)).not.toContain('provider-thread-1');
  });

  it('re-derives an immutable descriptor Agent profile after Gateway restart rather than accepting a control-plane prompt', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const first = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    await first.create({ conversationId: 'browser-sourcing-conversation', runtime: 'codex_cli', agentKey: 'sourcing', title: 'Sourcing' });

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });
    await restarted.startTurn({
      conversationId: 'browser-sourcing-conversation', turnId: 'turn-after-restart', message: 'Use the selected Agent.',
      model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: 'binding-after-restart', onEvent: () => undefined,
    });

    expect(provider.started).toEqual([expect.objectContaining({
      instructionProfile: expect.objectContaining({
        selectedAgentKey: 'sourcing',
        selectedInstructions: expect.stringContaining('KidItem Sourcing Agent'),
        delegationProfiles: expect.arrayContaining([
          expect.objectContaining({ key: 'channel_operations', instructions: expect.stringContaining('KidItem Channel Operations Agent') }),
        ]),
      }),
    })]);
  });

  it('deletes at the provider before the descriptor and keeps the descriptor on provider failure', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('claude_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: new FakeProvider('codex_cli'), claude_cli: provider },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    await gateway.create({ conversationId: 'browser-conversation-3', runtime: 'claude_cli', agentKey: null, title: 'General chat' });
    provider.deleteFailure = true;

    await expect(gateway.delete('browser-conversation-3')).rejects.toThrow('gateway_provider_delete_failed');
    expect((await gateway.list()).map((conversation) => conversation.id)).toEqual(['browser-conversation-3']);

    provider.deleteFailure = false;
    await gateway.delete('browser-conversation-3');
    expect(provider.deleted).toEqual(['provider-thread-1']);
    expect(await gateway.list()).toEqual([]);

    await expect(gateway.delete('browser-conversation-3')).resolves.toBeUndefined();
    expect(provider.deleted).toEqual(['provider-thread-1']);
  });

  it('revalidates bounded provider history and a rename title before either crosses the Gateway boundary', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    await gateway.create({ conversationId: 'browser-conversation-4', runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    provider.messages = [{ id: 'provider-message-1', role: 'assistant', content: 'x'.repeat(16_001), createdAt: '2026-08-23T00:00:00.000Z' }];

    await expect(gateway.history('browser-conversation-4')).rejects.toThrow('gateway_provider_history_failed');
    await expect(gateway.rename('browser-conversation-4', ' ')).rejects.toThrow();
    expect(provider.renameCalls).toEqual([]);
  });

  it('never restores a descriptor after a racing provider-backed rename or best-effort turn metadata update loses to delete', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const renameGate = deferred<void>();
    const turnGate = deferred<void>();
    const renameStarted = deferred<void>();
    const turnStarted = deferred<void>();
    provider.renameGate = renameGate.promise;
    provider.turnGate = turnGate.promise;
    provider.renameStarted = () => renameStarted.resolve();
    provider.turnStarted = () => turnStarted.resolve();
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });
    await gateway.create({ conversationId: 'browser-racing-delete', runtime: 'codex_cli', agentKey: null, title: 'General chat' });

    const rename = gateway.rename('browser-racing-delete', 'Renamed before delete');
    await renameStarted.promise;
    const turn = gateway.startTurn({
      conversationId: 'browser-racing-delete', turnId: 'turn-racing-delete', message: 'Record metadata.',
      model: 'gpt-5.6', reasoningEffort: 'high', executionBinding: 'binding-racing-delete', onEvent: () => undefined,
    });
    await turnStarted.promise;
    await gateway.delete('browser-racing-delete');
    renameGate.resolve();
    turnGate.resolve();

    await expect(rename).rejects.toThrow('gateway_descriptor_not_found');
    await expect(turn).resolves.toBeUndefined();
    expect(await gateway.list()).toEqual([]);
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-conversations-'));
  roots.push(root);
  return root;
}

class FakeProvider {
  readonly started: unknown[] = [];
  readonly created: unknown[] = [];
  readonly historyRefs: string[] = [];
  readonly deleted: string[] = [];
  readonly renameCalls: Array<{ providerConversationRef: string; title: string }> = [];
  messages: unknown[] = [];
  deleteFailure = false;
  createGate: Promise<void> | undefined;
  renameGate: Promise<void> | undefined;
  turnGate: Promise<void> | undefined;
  createStarted: (() => void) | undefined;
  renameStarted: (() => void) | undefined;
  turnStarted: (() => void) | undefined;
  private nextRef = 1;

  constructor(readonly runtime: 'codex_cli' | 'claude_cli') {}

  async list() { return []; }
  async create(input: { title?: string }) {
    this.created.push(input);
    this.createStarted?.();
    await this.createGate;
    return {
      providerConversationRef: `provider-thread-${this.nextRef++}`,
      title: input.title ?? 'New conversation',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    };
  }
  async history(providerConversationRef: string) { this.historyRefs.push(providerConversationRef); return this.messages; }
  async rename(providerConversationRef: string, title: string) {
    this.renameCalls.push({ providerConversationRef, title });
    this.renameStarted?.();
    await this.renameGate;
  }
  async delete(providerConversationRef: string) {
    if (this.deleteFailure) throw new Error('provider refuses deletion');
    this.deleted.push(providerConversationRef);
  }
  async startTurn(input: unknown) {
    this.started.push(input);
    this.turnStarted?.();
    await this.turnGate;
  }
  async sendInput() { return undefined; }
  async interrupt() { return undefined; }
  async readiness() {
    return {
      runtime: this.runtime,
      version: 'test-version',
      models: this.runtime === 'codex_cli' ? ['gpt-5.6'] : ['claude-fable-5'],
      reasoningEfforts: ['low', 'medium', 'high'],
      modelReasoningEfforts: [{ model: this.runtime === 'codex_cli' ? 'gpt-5.6' : 'claude-fable-5', reasoningEfforts: ['low', 'medium', 'high'] }],
      loginVerified: true as const,
      mcpProtocolRevision: '2026-07-28' as const,
    };
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve: (value) => resolve?.(value) };
}

function descriptorWriteFailureFilesystem() {
  return {
    mkdir: async () => undefined,
    chmod: async () => undefined,
    readFile: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    writeFile: async () => { throw new Error('descriptor write failure'); },
    rename: async () => undefined,
    unlink: async () => undefined,
  };
}
