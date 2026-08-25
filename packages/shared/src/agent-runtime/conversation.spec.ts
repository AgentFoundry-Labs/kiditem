import { describe, expect, it } from 'vitest';

describe('Gateway conversation contract', () => {
  it('exposes only opaque public conversation data and bounded provider history', async () => {
    const { ConversationSummarySchema, ProviderMessageSchema } = await import('./conversation');

    expect(ConversationSummarySchema.parse({
      id: 'conversation-1',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'Supplier research',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:01:00.000Z',
      lastModel: 'gpt-5.6',
      lastReasoningEffort: 'medium',
    })).not.toHaveProperty('providerConversationRef');

    expect(ProviderMessageSchema.parse({
      id: 'message-1',
      role: 'assistant',
      content: 'I found two matching products.',
      createdAt: '2026-08-23T00:01:00.000Z',
    })).toMatchObject({ role: 'assistant' });
  });

  it('keeps the runtime immutable and restricts conversation agent keys to the five published Agents', async () => {
    const { CreateConversationCommandSchema, ProviderRuntimeSchema } = await import('./conversation');

    expect(ProviderRuntimeSchema.options).toEqual(['codex_cli', 'claude_cli']);
    expect(CreateConversationCommandSchema.safeParse({
      runtime: 'claude_cli',
      agentKey: 'sourcing',
      title: 'Sourcing chat',
    }).success).toBe(true);
    expect(CreateConversationCommandSchema.safeParse({
      runtime: 'codex_cli',
      agentKey: 'operator',
    }).success).toBe(false);
    expect(CreateConversationCommandSchema.safeParse({
      runtime: 'codex_cli',
      agentKey: null,
      nextRuntime: 'claude_cli',
    }).success).toBe(false);
  });

  it('represents only bounded live provider deltas and terminal status, never raw provider payloads', async () => {
    const { ProviderEventSchema } = await import('./conversation');

    expect(ProviderEventSchema.parse({ kind: 'assistant.delta', delta: 'Bounded live output.' }))
      .toEqual({ kind: 'assistant.delta', delta: 'Bounded live output.' });
    expect(ProviderEventSchema.parse({ kind: 'status', status: 'completed' }))
      .toEqual({ kind: 'status', status: 'completed' });
    expect(ProviderEventSchema.safeParse({ kind: 'status', status: 'provider_payload', raw: { credential: 'secret' } }).success)
      .toBe(false);
  });

  it('requires an explicit model-to-reasoning-effort catalog for a ready provider', async () => {
    const { ProviderReadinessSchema } = await import('./conversation');

    expect(ProviderReadinessSchema.parse({
      runtime: 'codex_cli',
      version: '0.149.1',
      models: ['gpt-5.6'],
      reasoningEfforts: ['low', 'high'],
      modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low', 'high'] }],
      loginVerified: true,
      mcpProtocolRevision: '2026-07-28',
    })).toMatchObject({ runtime: 'codex_cli' });

    expect(ProviderReadinessSchema.safeParse({
      runtime: 'codex_cli',
      version: '0.149.1',
      models: ['gpt-5.6'],
      reasoningEfforts: ['low', 'high'],
      loginVerified: true,
      mcpProtocolRevision: '2026-07-28',
    }).success).toBe(false);
  });
});
