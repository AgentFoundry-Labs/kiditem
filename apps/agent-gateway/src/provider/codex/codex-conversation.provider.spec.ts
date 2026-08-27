import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../../profile/agent-profile.catalog';

describe('CodexConversationProvider', () => {
  it('adapts provider-persistent app-server thread methods without exposing thread IDs beyond the provider port', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });

    await provider.create({ conversationId: 'conversation-1', title: 'Thread', instructionProfile: gatewayInstructionProfile(null) });
    await provider.rename('thread-1', 'Renamed');
    await provider.delete('thread-1');
    await provider.startTurn({ providerConversationRef: 'thread-1', conversationId: 'conversation-1', turnId: 'turn-1', message: 'Work', model: 'gpt-5.6', reasoningEffort: 'medium', instructionProfile: gatewayInstructionProfile(null) }, () => undefined);
    await provider.interrupt({ providerConversationRef: 'thread-1', turnId: 'turn-1' });

    expect(session.calls).toEqual(['create', 'rename', 'archive', 'start', 'interrupt']);
    await expect(provider.readiness()).resolves.toMatchObject({ runtime: 'codex_cli', version: '0.149.1' });
  });

  it('fails deletion when an archive rejection finds the exact provider thread on a later reconciliation page', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    session.archiveFailure = true;
    session.pages = [
      { conversations: [], nextCursor: 'cursor-2' },
      { conversations: [conversation('thread-present-later')], nextCursor: null },
    ];

    await expect(provider.delete('thread-present-later')).rejects.toThrow('codex_provider_delete_failed');
    expect(session.archived).toEqual(['thread-present-later']);
    expect(session.pageCursors).toEqual([undefined, 'cursor-2']);
  });

  it('treats an archive rejection as idempotent only after every bounded reconciliation page is exhausted', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    session.archiveFailure = true;
    session.pages = [
      { conversations: [], nextCursor: 'cursor-2' },
      { conversations: [], nextCursor: null },
    ];

    await expect(provider.delete('thread-absent')).resolves.toBeUndefined();
    expect(session.archived).toEqual(['thread-absent']);
    expect(session.pageCursors).toEqual([undefined, 'cursor-2']);
  });

  it('fails closed when four reconciliation pages still leave a provider cursor', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    session.archiveFailure = true;
    session.pages = [
      { conversations: [], nextCursor: 'cursor-2' },
      { conversations: [], nextCursor: 'cursor-3' },
      { conversations: [], nextCursor: 'cursor-4' },
      { conversations: [], nextCursor: 'cursor-5' },
    ];

    await expect(provider.delete('thread-at-bound')).rejects.toThrow('codex_provider_delete_failed');
    expect(session.pageCursors).toEqual([undefined, 'cursor-2', 'cursor-3', 'cursor-4']);
  });
});

type Conversation = { providerConversationRef: string; title: string; createdAt: string; updatedAt: string };
type ConversationPage = { conversations: Conversation[]; nextCursor: string | null };

class FakeCodexSession {
  closed = false;
  calls: string[] = [];
  archived: string[] = [];
  pageCursors: Array<string | undefined> = [];
  pages: ConversationPage[] = [];
  threads: Conversation[] = [];
  archiveFailure = false;
  async listConversations() { this.calls.push('list'); return this.threads; }
  async listConversationsPage(cursor?: string) {
    this.calls.push('list-page');
    this.pageCursors.push(cursor);
    const page = this.pages[this.pageCursors.length - 1];
    return page ?? { conversations: this.threads, nextCursor: null };
  }
  async createConversation() { this.calls.push('create'); return { providerConversationRef: 'thread-1', title: 'Thread', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }; }
  async rename() { this.calls.push('rename'); }
  async archive(providerConversationRef: string) {
    this.calls.push('archive');
    this.archived.push(providerConversationRef);
    if (this.archiveFailure) throw new Error('raw app-server archive failure');
  }
  async startTurn() { this.calls.push('start'); }
  async interrupt() { this.calls.push('interrupt'); }
  isClosed() { return this.closed; }
}

function conversation(providerConversationRef: string): Conversation {
  return {
    providerConversationRef,
    title: 'Still present',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
}
