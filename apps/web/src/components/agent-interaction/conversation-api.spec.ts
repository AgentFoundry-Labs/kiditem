import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import * as conversationApi from './conversation-api';
import {
  createConversation,
  deleteConversation,
  getConversationPreferences,
  listConversations,
  renameConversation,
  setConversationPreference,
} from './conversation-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('conversation API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses authenticated summary, creation, and preference endpoints while CopilotKit owns every turn interaction', async () => {
    const conversation = {
      id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General',
      createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
    };
    vi.mocked(apiClient.get).mockImplementation((path: string) => Promise.resolve(
      path === '/api/agent-os/conversation-preferences'
        ? { schemaVersion: 1, contexts: {} }
        : [],
    ) as never);
    vi.mocked(apiClient.post).mockImplementation((path: string) => Promise.resolve(
      path === '/api/agent-os/conversations' ? conversation : { turnId: 'turn-1' },
    ) as never);
    vi.mocked(apiClient.patch).mockResolvedValue(conversation as never);
    vi.mocked(apiClient.put).mockResolvedValue({ schemaVersion: 1, contexts: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({} as never);

    await listConversations();
    await createConversation({
      runtime: 'codex_cli', agentKey: null, title: 'General',
    });
    await getConversationPreferences();
    await setConversationPreference({
      context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    await renameConversation('conversation-1', 'Renamed');
    await deleteConversation('conversation-1');

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations', {
      runtime: 'codex_cli', agentKey: null, title: 'General',
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/agent-os/conversation-preferences');
    expect(apiClient.put).toHaveBeenCalledWith('/api/agent-os/conversation-preferences', {
      context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    expect(conversationApi).not.toHaveProperty('getConversationHistory');
    expect(conversationApi).not.toHaveProperty('startConversationTurn');
    expect(conversationApi).not.toHaveProperty('sendConversationInput');
    expect(conversationApi).not.toHaveProperty('interruptConversation');
    expect(conversationApi).not.toHaveProperty('stopConversationTurn');
    expect(conversationApi).not.toHaveProperty('loadConversationReadiness');
    expect(apiClient.patch).toHaveBeenCalledWith('/api/agent-os/conversations/conversation-1', { title: 'Renamed' });
    expect(apiClient.delete).toHaveBeenCalledWith('/api/agent-os/conversations/conversation-1');
    expect(JSON.stringify(vi.mocked(apiClient.post).mock.calls)).not.toMatch(/provider|binding|owner|credential/i);
  });

  it('rejects malformed create and preference payloads before they leave the browser boundary', async () => {
    await expect(createConversation({
      runtime: 'codex_cli', agentKey: null, title: '   ',
    })).rejects.toThrow();
    await expect(setConversationPreference({
      context: 'general', runtime: 'codex_cli', model: '', reasoningEffort: 'low',
    })).rejects.toThrow();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('rejects an empty title rename before it reaches the browser API boundary', async () => {
    await expect(renameConversation('conversation-1', '   ')).rejects.toThrow();

    expect(apiClient.patch).not.toHaveBeenCalled();
  });

});
