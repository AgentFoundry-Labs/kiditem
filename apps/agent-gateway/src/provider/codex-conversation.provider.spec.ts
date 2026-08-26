import { describe, expect, it } from 'vitest';
import { gatewayInstructionProfile } from '../profile/agent-profile.catalog';

describe('CodexConversationProvider', () => {
  it('adapts provider-persistent app-server thread methods without exposing thread IDs beyond the provider port', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });

    await provider.create({ title: 'Thread', instructionProfile: gatewayInstructionProfile(null) });
    await provider.rename('thread-1', 'Renamed');
    await provider.delete('thread-1');
    await provider.startTurn({ providerConversationRef: 'thread-1', turnId: 'turn-1', message: 'Work', model: 'gpt-5.6', reasoningEffort: 'medium', executionBinding: 'A'.repeat(43), instructionProfile: gatewayInstructionProfile(null) }, () => undefined);
    await provider.sendInput({ providerConversationRef: 'thread-1', turnId: 'turn-1', message: 'More' });
    await provider.interrupt({ providerConversationRef: 'thread-1', turnId: 'turn-1' });

    expect(session.calls).toEqual(['create', 'rename', 'archive', 'start', 'steer', 'interrupt']);
    await expect(provider.readiness()).resolves.toMatchObject({ runtime: 'codex_cli', version: '0.149.1' });
  });

  it('treats an archive rejection as success only when the exact provider thread is absent from the top-level list', async () => {
    const { CodexConversationProvider } = await import('./codex-conversation.provider');
    const session = new FakeCodexSession();
    const provider = new CodexConversationProvider({
      session,
      readiness: { runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['medium'], modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['medium'] }], loginVerified: true, mcpProtocolRevision: '2026-07-28' },
    });
    session.archiveFailure = true;

    await expect(provider.delete('thread-absent')).resolves.toBeUndefined();
    expect(session.archived).toEqual(['thread-absent']);
    expect(session.calls).toEqual(['archive', 'list']);

    session.threads = [{ providerConversationRef: 'thread-present', title: 'Still present', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }];
    await expect(provider.delete('thread-present')).rejects.toThrow('codex_provider_delete_failed');
    expect(session.archived).toEqual(['thread-absent', 'thread-present']);
  });
});

class FakeCodexSession {
  calls: string[] = [];
  archived: string[] = [];
  threads: Array<{ providerConversationRef: string; title: string; createdAt: string; updatedAt: string }> = [];
  archiveFailure = false;
  async listConversations() { this.calls.push('list'); return this.threads; }
  async createConversation() { this.calls.push('create'); return { providerConversationRef: 'thread-1', title: 'Thread', createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' }; }
  async history() { this.calls.push('history'); return []; }
  async rename() { this.calls.push('rename'); }
  async archive(providerConversationRef: string) {
    this.calls.push('archive');
    this.archived.push(providerConversationRef);
    if (this.archiveFailure) throw new Error('raw app-server archive failure');
  }
  async startTurn() { this.calls.push('start'); }
  async steer() { this.calls.push('steer'); }
  async interrupt() { this.calls.push('interrupt'); }
}
