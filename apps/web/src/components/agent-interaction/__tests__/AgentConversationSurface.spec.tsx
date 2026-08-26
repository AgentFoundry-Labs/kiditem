import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { AgentConversationSurface } from '../AgentConversationSurface';
import { ConversationRuntimeHost } from '../ConversationRuntimeHost';
import { useConversationSurfaceState } from '../conversation-surface-state';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const runtimeMocks = vi.hoisted(() => {
  const subscriptions: Array<Record<string, unknown>> = [];
  const runAgent = vi.fn();
  const addMessage = vi.fn();
  const setMessages = vi.fn();
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  return {
    useAgent: vi.fn(),
    runAgent,
    addMessage,
    setMessages,
    subscriptions,
    unsubscribes,
    agent: {
      messages: [],
      runAgent,
      addMessage,
      setMessages,
      subscribe: (subscriber: Record<string, unknown>) => {
        subscriptions.push(subscriber);
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        return { unsubscribe };
      },
    },
  };
});
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: (input: unknown) => {
    runtimeMocks.useAgent(input);
    return { agent: runtimeMocks.agent, isReady: true };
  },
}));

const CONVERSATION = {
  id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: null,
  title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
};
const IDENTITY = { userId: 'user-1', organizationId: 'org-1' };
const READINESS_INFO = {
  agents: {
    conversation: {
      capabilities: {
        custom: {
          gatewayReadiness: [
            {
              runtime: 'codex_cli', ready: true,
              readiness: {
                runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
                modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
                loginVerified: true, mcpProtocolRevision: '2026-07-28',
              },
            },
            {
              runtime: 'claude_cli', ready: true,
              readiness: {
                runtime: 'claude_cli', version: '1.0.0', models: ['claude-opus'], reasoningEfforts: ['high'],
                modelReasoningEfforts: [{ model: 'claude-opus', reasoningEfforts: ['high'] }],
                loginVerified: true, mcpProtocolRevision: '2026-07-28',
              },
            },
          ],
        },
      },
    },
  },
};

function renderSurface(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationRuntimeHost identity={IDENTITY}><AgentConversationSurface /></ConversationRuntimeHost>
    </QueryClientProvider>,
  );
}

async function chooseCodexPair(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));
  const runtime = screen.getByLabelText('대화 엔진');
  if (!runtime.hasAttribute('disabled') && (runtime as HTMLSelectElement).value === '') {
    await user.selectOptions(runtime, 'codex_cli');
  }
  await waitFor(() => expect(screen.getByLabelText('모델')).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('모델'), 'gpt-5.6');
  await user.selectOptions(screen.getByLabelText('사고 수준'), 'low');
}

describe('AgentConversationSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.runAgent.mockResolvedValue(undefined);
    runtimeMocks.addMessage.mockReset();
    runtimeMocks.setMessages.mockReset();
    runtimeMocks.subscriptions.length = 0;
    runtimeMocks.unsubscribes.length = 0;
    useConversationSurfaceState.getState().reset();
    useConversationSurfaceState.getState().selectConversation(CONVERSATION);
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/copilotkit') return Promise.resolve(READINESS_INFO as never);
      return Promise.resolve({ turnId: 'turn-1' } as never);
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('makes the Dashboard return action first in keyboard order and targets /dashboard', async () => {
    renderSurface();

    await screen.findByRole('link', { name: '대시보드로 돌아가기' });
    const firstFocusable = document.querySelector('a[href], button, input, select, textarea');
    expect(firstFocusable).toHaveAccessibleName('대시보드로 돌아가기');
    expect(firstFocusable).toHaveAttribute('href', '/dashboard');
  });

  it('uses a 288px desktop tree and one modal drawer trigger for the Agent OS workspace', async () => {
    renderSurface();

    const tree = await screen.findByRole('navigation', { name: '대화 목록' });
    expect(tree).toHaveClass('w-72');
    expect(tree.parentElement).toHaveClass('hidden', 'lg:flex');
    fireEvent.click(screen.getByRole('button', { name: '대화 목록 열기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('traps keyboard focus in the mobile folder drawer', async () => {
    renderSurface();
    await screen.findByPlaceholderText('무엇을 도와드릴까요?');

    fireEvent.click(await screen.findByRole('button', { name: '대화 목록 열기' }));
    const drawer = await screen.findByRole('dialog');
    const closeButton = within(drawer).getByRole('button', { name: '대화 목록 닫기' });
    const firstFocusable = within(drawer).getByRole('button', { name: '새 AI 대화' });

    closeButton.focus();
    const tabHandled = fireEvent.keyDown(closeButton, { key: 'Tab' });

    expect(tabHandled).toBe(false);
    expect(firstFocusable).toHaveFocus();
  });

  it('lets a topmost settings dialog consume Escape without dismissing the mobile folder drawer', async () => {
    renderSurface();
    await screen.findByPlaceholderText('무엇을 도와드릴까요?');

    const opener = await screen.findByRole('button', { name: '대화 목록 열기' });
    opener.focus();
    fireEvent.click(opener);
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: '대화 설정' }));
    const settingsDialog = await screen.findByRole('dialog', { name: '대화 설정' });
    fireEvent.keyDown(settingsDialog, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '대화 설정' })).not.toBeInTheDocument();
    });
    expect(drawer).toBeInTheDocument();
  });

  it('restores focus to the exact mobile folder drawer opener after close', async () => {
    renderSurface();
    await screen.findByPlaceholderText('무엇을 도와드릴까요?');

    const opener = await screen.findByRole('button', { name: '대화 목록 열기' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByRole('button', { name: '대화 목록 닫기' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('opens the primary General draft without a conversation request and focuses its compact composer', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'general-draft') });
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();
    await screen.findByRole('navigation', { name: '대화 목록' });
    vi.clearAllMocks();

    await user.click(screen.getByRole('button', { name: '새 AI 대화' }));

    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    expect(composer).toHaveFocus();
    expect(screen.getByRole('button', { name: '대화 엔진 설정' })).toBeVisible();
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'general-draft', agentKey: null, provider: null,
    });
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(vi.mocked(apiClient.get)).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('opens an Agent-bound draft from its folder plus action without creating a conversation', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'sourcing-draft') });
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();
    await screen.findByRole('navigation', { name: '대화 목록' });
    vi.clearAllMocks();

    await user.click(screen.getByRole('button', { name: '소싱 Agent 새 AI 대화' }));

    expect(await screen.findByPlaceholderText('소싱 Agent에게 무엇을 요청할까요?')).toHaveFocus();
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'sourcing-draft', agentKey: 'sourcing', provider: null,
    });
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(vi.mocked(apiClient.get)).not.toHaveBeenCalled();
  });

  it('uses one combined selector, validates its pair, and sends Enter only outside IME composition', async () => {
    const user = userEvent.setup();
    renderSurface();
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await chooseCodexPair(user);
    expect(screen.getByLabelText('대화 엔진')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /첨부|마이크|음성|media/i })).not.toBeInTheDocument();

    await user.type(composer, 'Review the evidence.');
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    })));
  });

  it('clears the visible composer after a first General draft is promoted and its turn completes', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('general-draft')
        .mockReturnValueOnce('first-turn'),
    });
    const promoted = {
      ...CONVERSATION,
      id: 'general-draft',
      title: 'KID-25 QA 연결 확인이라고 답해.',
    };
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve(promoted as never);
      if (path === '/api/copilotkit') return Promise.resolve(READINESS_INFO as never);
      return Promise.resolve({ turnId: 'first-turn' } as never);
    });
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([] as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    let resolveRun!: () => void;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();

    await user.click(await screen.findByRole('button', { name: '새 AI 대화' }));
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'general-draft',
      agentKey: null,
    });
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await chooseCodexPair(user);
    await user.type(composer, 'KID-25 QA 연결 확인이라고 답해.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: 'general-draft',
      pendingDraft: { conversationId: 'general-draft' },
    }));
    expect(screen.getByLabelText('일반 AI 챗 메시지')).toHaveValue('');
    await act(async () => resolveRun());
    await waitFor(() => expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: 'general-draft',
      pendingDraft: null,
    }));
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('일반 AI 챗 메시지')).toHaveValue('');
  });

  it('keeps the active conversation and its one subscription while another folder expands during a turn', async () => {
    const running = new Promise<void>(() => undefined);
    runtimeMocks.runAgent.mockReturnValue(running);
    const user = userEvent.setup();
    renderSurface();
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await chooseCodexPair(user);
    await user.type(composer, 'Keep this active.');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const unsubscribe = runtimeMocks.unsubscribes[0];

    await user.click(screen.getByRole('button', { name: '상품 Agent' }));

    expect(useConversationSurfaceState.getState().activeConversationId).toBe(CONVERSATION.id);
    expect(screen.getByPlaceholderText('무엇을 도와드릴까요?')).toBeInTheDocument();
    expect(runtimeMocks.subscriptions).toHaveLength(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('keeps live messages and tool cards in the shared flow until refreshed history covers the terminal reply', async () => {
    let history: unknown[] = [];
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) return Promise.resolve(history as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    const user = userEvent.setup();
    renderSurface();
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await chooseCodexPair(user);
    await user.type(composer, 'Review the evidence.');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
      onRunFinalized?: () => void;
    };

    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-reply', role: 'assistant', content: 'Provider reply' }],
    }));
    await act(async () => subscriber.onCustomEvent?.({
      event: { name: 'kiditem.provider_tool_status', value: { name: 'source_search', status: 'running' } },
    }));
    expect(screen.getByText('Provider reply')).toBeVisible();
    expect(screen.getByText('source_search')).toBeVisible();

    history = [{
      id: 'history-reply', role: 'assistant', content: 'Provider reply', createdAt: '2026-08-26T00:01:00.000Z',
    }];
    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(screen.getAllByText('Provider reply')).toHaveLength(1));
    expect(screen.queryByText('source_search')).not.toBeInTheDocument();
    await act(async () => resolveRun?.());
  });
});
