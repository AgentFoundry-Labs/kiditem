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
      randomId: () => 'opaque-conversation-id',
    });

    const created = await gateway.create({ runtime: 'codex_cli', agentKey: 'sourcing', title: 'Supplier research' });
    expect(created).toEqual({
      id: 'opaque-conversation-id',
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

  it('reads history from the provider after a Gateway restart without copying a provider ref into public output', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const descriptors = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const first = new ConversationGateway({
      descriptors,
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
      randomId: () => 'opaque-conversation-id',
    });
    await first.create({ runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    provider.messages = [{ id: 'message-1', role: 'assistant', content: 'Provider-native history.', createdAt: '2026-08-23T00:01:00.000Z' }];

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:02:00.000Z'),
      randomId: () => 'different-id',
    });
    const history = await restarted.history('opaque-conversation-id');

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
      randomId: () => 'opaque-sourcing-conversation',
    });
    await first.create({ runtime: 'codex_cli', agentKey: 'sourcing', title: 'Sourcing' });

    const restarted = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:01:00.000Z'),
    });
    await restarted.startTurn({
      conversationId: 'opaque-sourcing-conversation', turnId: 'turn-after-restart', message: 'Use the selected Agent.',
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
      randomId: () => 'opaque-conversation-id',
    });
    await gateway.create({ runtime: 'claude_cli', agentKey: null, title: 'General chat' });
    provider.deleteFailure = true;

    await expect(gateway.delete('opaque-conversation-id')).rejects.toThrow('gateway_provider_delete_failed');
    expect((await gateway.list()).map((conversation) => conversation.id)).toEqual(['opaque-conversation-id']);

    provider.deleteFailure = false;
    await gateway.delete('opaque-conversation-id');
    expect(provider.deleted).toEqual(['provider-thread-1']);
    expect(await gateway.list()).toEqual([]);
  });

  it('revalidates bounded provider history and a rename title before either crosses the Gateway boundary', async () => {
    const { ConversationGateway } = await import('./conversation-gateway');
    const root = await fixtureRoot();
    const provider = new FakeProvider('codex_cli');
    const gateway = new ConversationGateway({
      descriptors: new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' }),
      providers: { codex_cli: provider, claude_cli: new FakeProvider('claude_cli') },
      now: () => new Date('2026-08-23T00:00:00.000Z'),
      randomId: () => 'opaque-conversation-id',
    });
    await gateway.create({ runtime: 'codex_cli', agentKey: null, title: 'General chat' });
    provider.messages = [{ id: 'provider-message-1', role: 'assistant', content: 'x'.repeat(16_001), createdAt: '2026-08-23T00:00:00.000Z' }];

    await expect(gateway.history('opaque-conversation-id')).rejects.toThrow('gateway_provider_history_failed');
    await expect(gateway.rename('opaque-conversation-id', ' ')).rejects.toThrow();
    expect(provider.renameCalls).toEqual([]);
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
  private nextRef = 1;

  constructor(readonly runtime: 'codex_cli' | 'claude_cli') {}

  async list() { return []; }
  async create(input: { title?: string }) {
    this.created.push(input);
    return {
      providerConversationRef: `provider-thread-${this.nextRef++}`,
      title: input.title ?? 'New conversation',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    };
  }
  async history(providerConversationRef: string) { this.historyRefs.push(providerConversationRef); return this.messages; }
  async rename(providerConversationRef: string, title: string) { this.renameCalls.push({ providerConversationRef, title }); }
  async delete(providerConversationRef: string) {
    if (this.deleteFailure) throw new Error('provider refuses deletion');
    this.deleted.push(providerConversationRef);
  }
  async startTurn(input: unknown) { this.started.push(input); }
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
