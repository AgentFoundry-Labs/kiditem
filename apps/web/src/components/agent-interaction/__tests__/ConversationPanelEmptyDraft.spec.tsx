import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useConversationSurfaceState } from '../conversation-surface-state';
import { ConversationPanel } from '../ConversationPanel';
import { ConversationRuntimeHost } from '../ConversationRuntimeHost';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const runtimeMocks = vi.hoisted(() => {
  const runAgent = vi.fn();
  return {
    runAgent,
    connectAgent: vi.fn(),
    agent: {
      messages: [],
      runAgent,
      addMessage: vi.fn(),
      setMessages: vi.fn(),
      subscribe: () => ({ unsubscribe: vi.fn() }),
    },
  };
});

vi.mock('@copilotkit/react-core/v2', () => ({
  useCopilotKit: () => ({ copilotkit: { connectAgent: runtimeMocks.connectAgent } }),
  useAgent: () => ({ agent: runtimeMocks.agent, isReady: true }),
  useCapabilities: () => undefined,
}));

const IDENTITY = { userId: 'user-1', organizationId: 'org-1' };

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConversationRuntimeHost identity={IDENTITY}>
        <ConversationPanel onClose={vi.fn()} />
      </ConversationRuntimeHost>
    </QueryClientProvider>,
  );
}

describe('ConversationPanel empty draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'panel-empty-draft') });
    useConversationSurfaceState.getState().reset();
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the shared empty guidance and one typable local draft composer before any send', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByTestId('conversation-empty-state')).toBeVisible();
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    expect(composer).toHaveValue('');
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'panel-empty-draft',
      agentKey: null,
      message: '',
    });

    vi.clearAllMocks();
    await user.type(composer, '패널 초안을 작성해 주세요.');

    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'panel-empty-draft',
      message: '패널 초안을 작성해 주세요.',
    });
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });
});
