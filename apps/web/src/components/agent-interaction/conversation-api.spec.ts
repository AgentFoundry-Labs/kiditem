import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import * as conversationApi from './conversation-api';
import {
  createConversation,
  deleteConversation,
  getConversationPreferences,
  interruptConversation,
  listConversations,
  loadConversationReadiness,
  renameConversation,
  sendConversationInput,
  setConversationPreference,
  startConversationTurn,
} from './conversation-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('conversation API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses only authenticated same-origin summary and preference endpoints; provider history belongs to CopilotKit connect', async () => {
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
      conversationId: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General',
    });
    await getConversationPreferences();
    await setConversationPreference({
      context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    await renameConversation('conversation-1', 'Renamed');
    await startConversationTurn('conversation-1', {
      message: 'Review the evidence.', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    await sendConversationInput('conversation-1', 'turn-1', 'More context.');
    await interruptConversation('conversation-1', 'turn-1');
    await deleteConversation('conversation-1');

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations', {
      conversationId: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General',
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/agent-os/conversation-preferences');
    expect(apiClient.put).toHaveBeenCalledWith('/api/agent-os/conversation-preferences', {
      context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    expect(conversationApi).not.toHaveProperty('getConversationHistory');
    expect(apiClient.patch).toHaveBeenCalledWith('/api/agent-os/conversations/conversation-1', { title: 'Renamed' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/agent-os/conversations/conversation-1/turns', {
      message: 'Review the evidence.', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/api/agent-os/conversations/conversation-1/turns/turn-1/input', {
      message: 'More context.',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/api/agent-os/conversations/conversation-1/turns/turn-1/interrupt');
    expect(apiClient.delete).toHaveBeenCalledWith('/api/agent-os/conversations/conversation-1');
    expect(JSON.stringify(vi.mocked(apiClient.post).mock.calls)).not.toMatch(/provider|binding|owner|credential/i);
  });

  it('rejects malformed create and preference payloads before they leave the browser boundary', async () => {
    await expect(createConversation({
      conversationId: '', runtime: 'codex_cli', agentKey: null, title: 'General',
    })).rejects.toThrow();
    await expect(setConversationPreference({
      context: 'general', runtime: 'codex_cli', model: '', reasoningEffort: 'low',
    })).rejects.toThrow();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('rejects an empty history rename before it reaches the provider-facing endpoint', async () => {
    await expect(renameConversation('conversation-1', '   ')).rejects.toThrow();

    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('reads model and effort choices from the public CopilotKit info capability', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      agents: {
        conversation: {
          capabilities: {
            custom: {
              gatewayReadiness: [{
                runtime: 'codex_cli', ready: true,
                readiness: {
                  runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'],
                  reasoningEfforts: ['low'],
                  modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
                  loginVerified: true, mcpProtocolRevision: '2026-07-28',
                },
              }, {
                runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable',
              }],
            },
          },
        },
      },
    } as never);

    await expect(loadConversationReadiness()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ runtime: 'codex_cli', ready: true }),
    ]));
    expect(apiClient.post).toHaveBeenCalledWith('/api/copilotkit', {
      method: 'info', params: {}, body: {},
    });
  });
});
