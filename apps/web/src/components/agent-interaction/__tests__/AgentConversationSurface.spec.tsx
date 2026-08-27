import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useStore } from '@/store/useStore';
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
  const connectAgent = vi.fn();
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  return {
    useAgent: vi.fn(),
    runAgent,
    addMessage,
    setMessages,
    connectAgent,
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
  useCopilotKit: () => ({
    copilotkit: { connectAgent: runtimeMocks.connectAgent },
  }),
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
  const runtime = screen.getByRole('button', { name: '대화 엔진' });
  if (!runtime.hasAttribute('disabled')) {
    await user.click(runtime);
    await user.click(screen.getByRole('option', { name: 'Codex' }));
  }
  await waitFor(() => expect(screen.getByRole('button', { name: '모델' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '모델' }));
  await user.click(screen.getByRole('option', { name: 'gpt-5.6' }));
  await user.click(screen.getByRole('button', { name: '추론 수준' }));
  await user.click(screen.getByRole('option', { name: 'low' }));
}

describe('AgentConversationSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.runAgent.mockResolvedValue(undefined);
    runtimeMocks.addMessage.mockReset();
    runtimeMocks.setMessages.mockReset();
    runtimeMocks.connectAgent.mockReset();
    runtimeMocks.connectAgent.mockResolvedValue(undefined);
    runtimeMocks.subscriptions.length = 0;
    runtimeMocks.unsubscribes.length = 0;
    useConversationSurfaceState.getState().reset();
    useStore.setState({ sidebarOpen: true });
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

    await screen.findAllByRole('link', { name: '대시보드로 돌아가기' });
    const tree = screen.getByRole('navigation', { name: '대화 목록' });
    const main = screen.getByRole('main');
    expect(tree.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const firstFocusable = document.querySelector('a[href], button, input, select, textarea');
    expect(firstFocusable).toHaveAccessibleName('대시보드로 돌아가기');
    expect(firstFocusable).toHaveAttribute('href', '/dashboard');
  });

  it('uses the Task 5 shared 256px shell and a local mobile drawer for the Agent OS workspace', async () => {
    renderSurface();

    const shell = await screen.findByTestId('collapsible-sidebar-shell');
    expect(shell).toHaveAttribute('data-desktop-width', '256');
    expect(shell).toHaveClass('lg:w-[256px]');
    fireEvent.click(screen.getByRole('button', { name: '대화 목록 열기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shares the desktop collapse preference while preserving the selected conversation and keeping expand out of the header', async () => {
    renderSurface();

    const shell = await screen.findByTestId('collapsible-sidebar-shell');
    expect(screen.queryByRole('button', { name: '대화 목록 접기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(shell).toHaveAttribute('data-desktop-width', '64');
    expect(useStore.getState().sidebarOpen).toBe(false);
    expect(useConversationSurfaceState.getState().activeConversationId).toBe(CONVERSATION.id);
    expect(within(shell).getByRole('link', { name: '대시보드로 돌아가기' })).toHaveAttribute('href', '/dashboard');

    fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(useStore.getState().sidebarOpen).toBe(true);
  });

  it('keeps approval content in the shared message lane rather than a page-level strip', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConversationRuntimeHost identity={IDENTITY}>
          <AgentConversationSurface approvalContent={<div data-testid="approval-card">Approval card</div>} />
        </ConversationRuntimeHost>
      </QueryClientProvider>,
    );

    const messages = await screen.findByRole('region', { name: '대화 메시지' });
    expect(within(messages).getByTestId('approval-card')).toHaveTextContent('Approval card');
  });

  it('keeps the shared empty guidance above one typable local draft and fills that same draft from a suggestion', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'suggestion-draft') });
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();

    const emptyState = await screen.findByTestId('conversation-empty-state');
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    expect(within(emptyState).getByText('일반 AI 챗')).toBeVisible();
    expect(within(emptyState).getAllByRole('button', { name: /이번 주|상품 후보|운영 이슈/ })).toHaveLength(3);
    expect(composer).toHaveValue('');
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'suggestion-draft',
      agentKey: null,
      message: '',
    });
    vi.clearAllMocks();

    await user.click(within(emptyState).getByRole('button', { name: '이번 주 우선순위를 정리해 주세요' }));

    expect(composer).toHaveValue('이번 주 우선순위를 정리해 주세요');
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'suggestion-draft',
      agentKey: null,
      message: '이번 주 우선순위를 정리해 주세요',
    });
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('replaces a deleted selection with shared empty guidance and one new local composer draft', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'draft-after-delete') });
    const user = userEvent.setup();
    renderSurface();

    await user.click(await screen.findByRole('button', { name: 'Supplier research 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    expect(await screen.findByTestId('conversation-empty-state')).toBeVisible();
    expect(await screen.findByPlaceholderText('무엇을 도와드릴까요?')).toHaveValue('');
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'draft-after-delete',
      agentKey: null,
      message: '',
    });
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith('/api/agent-os/conversations/conversation-1');
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalledWith('/api/agent-os/conversations', expect.anything());
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('keeps a deep-linked approval in the centered message lane without an ephemeral conversation selection', async () => {
    useConversationSurfaceState.getState().reset();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConversationRuntimeHost identity={IDENTITY}>
          <AgentConversationSurface approvalContent={<div data-testid="deep-linked-approval">Approval card</div>} />
        </ConversationRuntimeHost>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('conversation-empty-state')).toBeVisible();
    const messages = await screen.findByRole('region', { name: '대화 메시지' });
    expect(within(messages).getByTestId('deep-linked-approval')).toHaveTextContent('Approval card');
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
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('initial-empty-draft')
        .mockReturnValueOnce('general-draft'),
    });
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();
    await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    vi.clearAllMocks();

    await user.click(screen.getByRole('button', { name: '새 AI 대화' }));

    const composer = screen.getByPlaceholderText('무엇을 도와드릴까요?');
    await waitFor(() => expect(composer).toHaveFocus());
    expect(screen.getByRole('button', { name: '대화 엔진 설정' })).toBeVisible();
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'general-draft', agentKey: null, provider: null,
    });
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(vi.mocked(apiClient.get)).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('opens an Agent-bound draft from its folder plus action without creating a conversation', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('initial-empty-draft')
        .mockReturnValueOnce('sourcing-draft'),
    });
    useConversationSurfaceState.getState().reset();
    const user = userEvent.setup();
    renderSurface();
    await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    vi.clearAllMocks();

    await user.click(screen.getByRole('button', { name: '소싱 Agent 새 AI 대화' }));

    const composer = await screen.findByPlaceholderText('소싱 Agent에게 무엇을 요청할까요?');
    await waitFor(() => expect(composer).toHaveFocus());
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
    expect(screen.getByRole('button', { name: '대화 엔진' })).toBeDisabled();
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
        .mockReturnValueOnce('initial-empty-draft')
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

    await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await user.click(screen.getByRole('button', { name: '새 AI 대화' }));
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

  it('suppresses generic provider tool events without leaking their private details', async () => {
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    const user = userEvent.setup();
    renderSurface();
    const composer = await screen.findByPlaceholderText('무엇을 도와드릴까요?');
    await chooseCodexPair(user);
    await user.type(composer, 'Review the evidence.');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: () => void;
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
    };

    runtimeMocks.agent.messages = [{ id: 'copilotkit-reply', role: 'assistant', content: 'Provider reply' }];
    await act(async () => subscriber.onMessagesChanged?.());
    await act(async () => subscriber.onCustomEvent?.({
      event: { name: 'kiditem.provider_tool_status', value: { name: 'source_search', status: 'started' } },
    }));
    await act(async () => subscriber.onCustomEvent?.({
      event: { name: 'kiditem.provider_tool_status', value: { name: 'source_search', status: 'completed' } },
    }));
    expect(screen.getByText('Provider reply')).toBeVisible();
    expect(within(screen.getByRole('region', { name: '대화 메시지' })).getByText('일반 AI 챗')).toBeVisible();
    expect(screen.queryByRole('region', { name: '업무 증거' })).not.toBeInTheDocument();
    expect(screen.queryByText('업무 처리')).not.toBeInTheDocument();
    expect(screen.queryByText('완료')).not.toBeInTheDocument();
    expect(screen.queryByText('source_search')).not.toBeInTheDocument();

    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => String(path)))
      .not.toContain('/api/agent-os/conversations/conversation-1/history');
    await act(async () => resolveRun?.());
  });
});
