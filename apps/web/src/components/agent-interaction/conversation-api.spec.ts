import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  createConversation,
  deleteConversation,
  getConversationHistory,
  interruptConversation,
  listConversations,
  loadConversationReadiness,
  renameConversation,
  sendConversationInput,
  startConversationTurn,
} from './conversation-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

describe('conversation API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses only authenticated same-origin conversation endpoints and public DTOs', async () => {
    const conversation = {
      id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'General',
      createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
    };
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
    vi.mocked(apiClient.post).mockImplementation((path: string) => Promise.resolve(
      path === '/api/agent-os/conversations' ? conversation : { turnId: 'turn-1' },
    ) as never);
    vi.mocked(apiClient.patch).mockResolvedValue(conversation as never);
    vi.mocked(apiClient.delete).mockResolvedValue({} as never);

    await listConversations();
    await createConversation({ runtime: 'codex_cli', agentKey: null, title: 'General' });
    await getConversationHistory('conversation-1');
    await renameConversation('conversation-1', 'Renamed');
    await startConversationTurn('conversation-1', {
      message: 'Review the evidence.', model: 'gpt-5.6', reasoningEffort: 'xhigh',
    });
    await sendConversationInput('conversation-1', 'turn-1', 'More context.');
    await interruptConversation('conversation-1', 'turn-1');
    await deleteConversation('conversation-1');

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/agent-os/conversations', {
      runtime: 'codex_cli', agentKey: null, title: 'General',
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/agent-os/conversations/conversation-1/history');
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
