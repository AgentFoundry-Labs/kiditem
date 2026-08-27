import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationDescriptorStore } from './conversation-descriptor.store';

const roots: string[] = [];
const ORGANIZATION_ID = 'organization-1';

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ConversationGateway', () => {
  it('persists and fences a descriptor by exact organization without exposing organization in public summaries', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: await fixtureRoot(), platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    const owner = 'organization-owner';
    const foreign = 'organization-foreign';
    const command = {
      organizationId: owner,
      conversationId: 'organization-fenced-conversation',
      runtime: 'codex_cli' as const,
      agentKey: null,
      title: 'Organization planning',
    };

    const created = await gateway.create(command as never);
    expect(created).not.toHaveProperty('organizationId');
    await expect(gateway.list(owner)).resolves.toEqual([created]);
    await expect(gateway.list(foreign)).resolves.toEqual([]);
    await expect(gateway.rename({ organizationId: foreign, conversationId: created.id, title: 'Foreign rename' } as never))
      .rejects.toThrow('gateway_conversation_not_found');
    await expect(gateway.delete({ organizationId: foreign, conversationId: created.id } as never))
      .rejects.toThrow('gateway_conversation_not_found');
    await expect(gateway.create({ ...command, organizationId: foreign } as never))
      .rejects.toThrow('gateway_conversation_not_found');
    expect(provider.renameCalls).toEqual([]);
    expect(provider.deleted).toEqual([]);
    expect(provider.created).toHaveLength(1);
  });

  it('maps an opaque descriptor to one fixed provider conversation and requires an explicitly supported model and effort', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: await fixtureRoot(), platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });

    const created = await gateway.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-1', runtime: 'codex_cli', agentKey: 'sourcing', title: 'Supplier research' });
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
      conversationId: 'browser-conversation-1',
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
      organizationId: ORGANIZATION_ID,
      conversationId: created.id,
      turnId: 'turn-1',
      message: 'Find current supplier inventory.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      onEvent: () => undefined,
    });
    expect(provider.started).toEqual([{
      providerConversationRef: 'provider-thread-1',
      conversationId: 'browser-conversation-1',
      turnId: 'turn-1',
      message: 'Find current supplier inventory.',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      instructionProfile: expect.objectContaining({
        selectedAgentKey: 'sourcing',
        selectedInstructions: expect.stringContaining('KidItem Sourcing Agent'),
        delegationProfiles: expect.arrayContaining([
          expect.objectContaining({ key: 'supply', instructions: expect.stringContaining('KidItem Supply Agent') }),
        ]),
      }),
    }]);

    await expect(gateway.startTurn({
      organizationId: ORGANIZATION_ID,
      conversationId: created.id,
      turnId: 'turn-2',
      message: 'Try an unsupported model.',
      model: 'silent-default',
      reasoningEffort: 'medium',
      onEvent: () => undefined,
    })).rejects.toThrow('gateway_model_unsupported');
    await expect(gateway.startTurn({
      organizationId: ORGANIZATION_ID,
      conversationId: created.id,
      turnId: 'turn-3',
      message: 'Try an unsupported effort.',
      model: 'gpt-5.6',
      reasoningEffort: 'none',
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
      organizationId: ORGANIZATION_ID,
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
      organizationId: ORGANIZATION_ID,
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
    const renamed = await gateway.rename({ organizationId: ORGANIZATION_ID, conversationId: original.conversationId, title: 'Renamed supplier research' });

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

  it('discards the exact pre-createTitle catalog before list and starts strict idempotent creates cleanly', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const legacyId = 'pre-create-title-conversation';
    const descriptorFile = join(root, 'conversations.json');
    // Exact descriptor JSON written before the immutable createTitle field
    // existed. This is a clean-cutover fixture, never an input to migrate.
    await writeFile(descriptorFile, JSON.stringify([{
      id: legacyId,
      runtime: 'codex_cli',
      providerConversationRef: 'pre-create-title-provider-thread',
      agentKey: 'sourcing',
      title: 'Supplier research',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      lastModel: 'gpt-5.6',
      lastReasoningEffort: 'medium',
    }]));
    const provider = new FakeProvider('codex_cli');
    const original = {
      organizationId: ORGANIZATION_ID,
      conversationId: 'current-schema-conversation',
      runtime: 'codex_cli' as const,
      agentKey: 'sourcing' as const,
      title: 'Current supplier research',
    };
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });

    await expect(gateway.list(ORGANIZATION_ID)).resolves.toEqual([]);
    expect(JSON.parse(await readFile(descriptorFile, 'utf8'))).toEqual([]);

    const created = await gateway.create(original);
    const renamed = await gateway.rename({ organizationId: ORGANIZATION_ID, conversationId: created.id, title: 'Renamed current research' });
    await expect(gateway.create(original)).resolves.toEqual(renamed);
    expect(JSON.parse(await readFile(descriptorFile, 'utf8'))).toEqual([expect.objectContaining({
      createTitle: original.title,
      title: 'Renamed current research',
    })]);
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
      await gateway.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-write-failure', runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ message: 'gateway_descriptor_create_failed' });
    expect(JSON.stringify(failure)).not.toContain('provider-thread-1');
    expect(provider.deleted).toEqual(['provider-thread-1']);
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
    await first.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-sourcing-conversation', runtime: 'codex_cli', agentKey: 'sourcing', title: 'Sourcing' });

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });
    await restarted.startTurn({
      organizationId: ORGANIZATION_ID,
      conversationId: 'browser-sourcing-conversation', turnId: 'turn-after-restart', message: 'Use the selected Agent.',
      model: 'gpt-5.6', reasoningEffort: 'medium', onEvent: () => undefined,
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
    await gateway.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-3', runtime: 'claude_cli', agentKey: null, title: 'General chat' });
    provider.deleteFailure = true;

    await expect(gateway.delete({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-3' })).rejects.toThrow('gateway_provider_delete_failed');
    expect((await gateway.list(ORGANIZATION_ID)).map((conversation) => conversation.id)).toEqual(['browser-conversation-3']);

    provider.deleteFailure = false;
    await gateway.delete({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-3' });
    expect(provider.deleted).toEqual(['provider-thread-1']);
    expect(await gateway.list(ORGANIZATION_ID)).toEqual([]);

    await expect(gateway.delete({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-3' })).rejects.toThrow('gateway_conversation_not_found');
    expect(provider.deleted).toEqual(['provider-thread-1']);
  });

  it('validates a rename title before it crosses the Gateway boundary', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    await gateway.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-4', runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    await expect(gateway.rename({ organizationId: ORGANIZATION_ID, conversationId: 'browser-conversation-4', title: ' ' })).rejects.toThrow();
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
    await gateway.create({ organizationId: ORGANIZATION_ID, conversationId: 'browser-racing-delete', runtime: 'codex_cli', agentKey: null, title: 'General chat' });

    const rename = gateway.rename({ organizationId: ORGANIZATION_ID, conversationId: 'browser-racing-delete', title: 'Renamed before delete' });
    await renameStarted.promise;
    const turn = gateway.startTurn({
      organizationId: ORGANIZATION_ID,
      conversationId: 'browser-racing-delete', turnId: 'turn-racing-delete', message: 'Record metadata.',
      model: 'gpt-5.6', reasoningEffort: 'high', onEvent: () => undefined,
    });
    await turnStarted.promise;
    await gateway.delete({ organizationId: ORGANIZATION_ID, conversationId: 'browser-racing-delete' });
    renameGate.resolve();
    turnGate.resolve();

    await expect(rename).rejects.toThrow('gateway_descriptor_not_found');
    await expect(turn).resolves.toBeUndefined();
    expect(await gateway.list(ORGANIZATION_ID)).toEqual([]);
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
  readonly deleted: string[] = [];
  readonly renameCalls: Array<{ providerConversationRef: string; title: string }> = [];
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
