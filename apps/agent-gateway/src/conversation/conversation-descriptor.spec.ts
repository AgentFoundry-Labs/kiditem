import { describe, expect, it } from 'vitest';

describe('ConversationDescriptorSchema', () => {
  it('contains exactly the bounded local sidebar fields and no transcript or control state', async () => {
    const { ConversationDescriptorSchema } = await import('./conversation-descriptor');
    const value = {
      id: 'conversation-1',
      runtime: 'claude_cli',
      providerConversationRef: '14f0a487-6ce5-4944-b1e4-5b0f7d0ceb99',
      agentKey: null,
      createTitle: 'General chat',
      title: 'General chat',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    };

    expect(ConversationDescriptorSchema.parse(value)).toEqual(value);
    expect(ConversationDescriptorSchema.safeParse({ ...value, createTitle: undefined }).success).toBe(false);
    expect(ConversationDescriptorSchema.safeParse({ ...value, messages: [] }).success).toBe(false);
    expect(ConversationDescriptorSchema.safeParse({ ...value, executionBinding: 'secret' }).success).toBe(false);
  });
});
