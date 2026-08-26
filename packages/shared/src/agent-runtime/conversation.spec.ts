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

  it('requires the browser-reserved ID and every public create field', async () => {
    const { CreateConversationCommandSchema, ProviderRuntimeSchema } = await import('./conversation');
    const command = {
      conversationId: 'browser-conversation-1',
      runtime: 'claude_cli',
      agentKey: null,
      title: 'Sourcing chat',
    };

    expect(ProviderRuntimeSchema.options).toEqual(['codex_cli', 'claude_cli']);
    expect(CreateConversationCommandSchema.parse(command)).toEqual(command);
    expect(CreateConversationCommandSchema.safeParse({
      runtime: 'claude_cli',
      agentKey: null,
      title: 'Sourcing chat',
    }).success).toBe(false);
    expect(CreateConversationCommandSchema.safeParse({
      conversationId: 'browser-conversation-1',
      agentKey: null,
      title: 'Sourcing chat',
    }).success).toBe(false);
    expect(CreateConversationCommandSchema.safeParse({
      conversationId: 'browser-conversation-1',
      runtime: 'claude_cli',
      title: 'Sourcing chat',
    }).success).toBe(false);
    expect(CreateConversationCommandSchema.safeParse({
      conversationId: 'browser-conversation-1',
      runtime: 'claude_cli',
      agentKey: null,
    }).success).toBe(false);
  });

  it('rejects server authority, provider references, credentials, transcript data, and execution bindings from creates', async () => {
    const { CreateConversationCommandSchema } = await import('./conversation');
    const command = {
      conversationId: 'browser-conversation-1',
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Supplier research',
    };

    for (const forbidden of [
      { organizationId: 'organization-1' },
      { userId: 'user-1' },
      { providerConversationRef: 'provider-thread-1' },
      { credential: 'secret' },
      { transcript: [{ role: 'user', content: 'private history' }] },
      { executionBinding: 'binding-1' },
    ]) {
      expect(CreateConversationCommandSchema.safeParse({ ...command, ...forbidden }).success).toBe(false);
    }
  });

  it('permits only general and the five published Agents as preference contexts', async () => {
    const { ConversationPreferenceContextSchema, ConversationPreferencesSchema } = await import('./conversation');
    const contexts = [
      'general',
      'sourcing',
      'merchandising',
      'supply',
      'channel_operations',
      'advertising',
    ];
    const preference = { model: 'gpt-5.6', reasoningEffort: 'medium' };
    const document = {
      schemaVersion: 1,
      contexts: Object.fromEntries(contexts.map((context) => [context, {
        codex_cli: preference,
        claude_cli: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
      }])),
    };

    expect(contexts.map((context) => ConversationPreferenceContextSchema.safeParse(context).success))
      .toEqual([true, true, true, true, true, true]);
    expect(ConversationPreferenceContextSchema.safeParse('operator').success).toBe(false);
    expect(ConversationPreferencesSchema.parse(document)).toEqual(document);
    expect(ConversationPreferencesSchema.safeParse({ ...document, schemaVersion: 2 }).success).toBe(false);
    expect(ConversationPreferencesSchema.safeParse({
      ...document,
      contexts: {
        ...document.contexts,
        operator: { codex_cli: preference },
      },
    }).success).toBe(false);
  });

  it('requires one bounded model and reasoning effort per provider and rejects unknown keys at every preference level', async () => {
    const {
      ConversationPreferenceSchema,
      ConversationPreferencesSchema,
      SetConversationPreferenceCommandSchema,
    } = await import('./conversation');
    const preference = { model: 'gpt-5.6', reasoningEffort: 'medium' };
    const document = {
      schemaVersion: 1,
      contexts: {
        general: { codex_cli: preference },
      },
    };

    expect(ConversationPreferenceSchema.parse(preference)).toEqual(preference);
    expect(ConversationPreferenceSchema.safeParse({ reasoningEffort: 'medium' }).success).toBe(false);
    expect(ConversationPreferenceSchema.safeParse({ model: 'gpt-5.6' }).success).toBe(false);
    expect(ConversationPreferenceSchema.safeParse({ model: '', reasoningEffort: 'medium' }).success).toBe(false);
    expect(ConversationPreferenceSchema.safeParse({ model: 'gpt-5.6', reasoningEffort: 'x'.repeat(101) }).success).toBe(false);

    for (const invalid of [
      { ...document, unknown: true },
      { ...document, contexts: { ...document.contexts, operator: {} } },
      { ...document, contexts: { general: { codex_cli: preference, other_cli: preference } } },
      { ...document, contexts: { general: { codex_cli: { ...preference, ignored: true } } } },
    ]) {
      expect(ConversationPreferencesSchema.safeParse(invalid).success).toBe(false);
    }

    expect(SetConversationPreferenceCommandSchema.parse({
      context: 'general',
      runtime: 'codex_cli',
      ...preference,
    })).toEqual({
      context: 'general',
      runtime: 'codex_cli',
      ...preference,
    });
    expect(SetConversationPreferenceCommandSchema.safeParse({
      context: 'general',
      runtime: 'codex_cli',
      ...preference,
      organizationId: 'organization-1',
    }).success).toBe(false);
  });

  it('restricts conversation agent keys to the five published Agents', async () => {
    const { CreateConversationCommandSchema } = await import('./conversation');

    expect(CreateConversationCommandSchema.safeParse({
      conversationId: 'browser-conversation-1',
      runtime: 'codex_cli',
      agentKey: 'operator',
      title: 'Sourcing chat',
    }).success).toBe(false);
    expect(CreateConversationCommandSchema.safeParse({
      conversationId: 'browser-conversation-1',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'Sourcing chat',
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
