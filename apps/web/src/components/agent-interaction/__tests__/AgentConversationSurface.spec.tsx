import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { AgentConversationSurface } from '../AgentConversationSurface';
import { useConversationSurfaceState } from '../conversation-surface-state';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const runtimeMocks = vi.hoisted(() => {
  const subscriptions: Array<Record<string, unknown>> = [];
  const runAgent = vi.fn();
  const addMessage = vi.fn();
  const setMessages = vi.fn();
  return {
    useAgent: vi.fn(),
    runAgent,
    addMessage,
    setMessages,
    subscriptions,
    agent: {
      messages: [],
      runAgent,
      addMessage,
      setMessages,
      subscribe: (subscriber: Record<string, unknown>) => {
        subscriptions.push(subscriber);
        return { unsubscribe: vi.fn() };
      },
    },
  };
});
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: (input: unknown) => {
    runtimeMocks.useAgent(input);
    return {
      agent: runtimeMocks.agent,
      isReady: true,
    };
  },
}));

const CONVERSATION = {
  id: 'conversation-1', runtime: 'codex_cli', agentKey: null, title: 'Supplier research',
  createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
};

const READINESS_INFO = {
  agents: {
    conversation: {
      capabilities: {
        custom: {
          gatewayReadiness: [
            {
              runtime: 'codex_cli',
              ready: true,
              readiness: {
                runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
                modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
                loginVerified: true, mcpProtocolRevision: '2026-07-28',
              },
            },
            { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
          ],
        },
      },
    },
  },
};

function renderSurface(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={queryClient}><AgentConversationSurface /></QueryClientProvider>);
}

describe('AgentConversationSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.runAgent.mockReset();
    runtimeMocks.addMessage.mockReset();
    runtimeMocks.setMessages.mockReset();
    runtimeMocks.subscriptions.length = 0;
    useConversationSurfaceState.getState().reset();
    useConversationSurfaceState.getState().selectConversation(CONVERSATION);
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve([] as never);
    });
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/copilotkit') return Promise.resolve(READINESS_INFO as never);
      return Promise.resolve({ turnId: 'turn-1' } as never);
    });
  });

  it('binds a private conversation agent and forwards explicit per-turn model and effort', async () => {
    const user = userEvent.setup();
    renderSurface();
    expect(await screen.findByRole('heading', { name: 'Supplier research' })).toBeVisible();
    expect(screen.getByText('General · Codex CLI')).toBeVisible();
    const composer = await screen.findByPlaceholderText('Message Supplier research');
    expect(composer).toHaveAttribute('maxLength', '16000');
    await user.type(composer, 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(runtimeMocks.useAgent).toHaveBeenCalledWith({
      agentId: 'kiditem-conversation:conversation-1', runtimeAgentId: 'conversation', threadId: 'conversation-1',
    }));
    expect(runtimeMocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    }));
  });

  it('uses the full viewport while keeping the workspace and message lane independently scrollable', async () => {
    renderSurface();

    await screen.findByRole('heading', { name: 'Supplier research' });
    const main = screen.getByRole('main');
    expect(main.parentElement).toHaveClass('h-dvh', 'overflow-hidden');
    expect(main).toHaveClass('min-h-0');
    expect(screen.getByLabelText('Conversation messages')).toHaveClass('overflow-y-auto');
  });

  it('reconciles a live active turn only after refreshed provider history supplies the terminal reply', async () => {
    let history: unknown[] = [];
    let historyRequests = 0;
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) {
        historyRequests += 1;
        return Promise.resolve(history as never);
      }
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('button', { name: 'Interrupt' })).toBeVisible();
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
      onRunFinalized?: () => void;
    };

    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-reply', role: 'assistant', content: 'Provider reply' }],
    }));
    expect(await screen.findByText('Provider reply')).toBeVisible();
    await act(async () => subscriber.onCustomEvent?.({
      event: {
        name: 'kiditem.provider_tool_status',
        value: { name: 'source_search', status: 'running' },
      },
    }));
    expect(await screen.findByText('source_search')).toBeVisible();
    history = [{
      id: 'provider-history-reply', role: 'assistant', content: 'Provider reply',
      createdAt: '2026-08-26T00:01:00.000Z',
    }];
    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(historyRequests).toBe(2));
    await waitFor(() => expect(screen.getAllByText('Provider reply')).toHaveLength(1));
    expect(screen.queryByText('source_search')).not.toBeInTheDocument();
    await act(async () => resolveRun?.());
  });

  it('clears the transient Copilot buffer after reconciliation before rendering the next turn', async () => {
    let history: unknown[] = [];
    let historyRequests = 0;
    const runResolvers: Array<() => void> = [];
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { runResolvers.push(resolve); }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) {
        historyRequests += 1;
        return Promise.resolve(history as never);
      }
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onRunFinalized?: () => void;
    };

    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-first-reply', role: 'assistant', content: 'Provider reply' }],
    }));
    history = [{
      id: 'history-first-reply', role: 'assistant', content: 'Provider reply',
      createdAt: '2026-08-26T00:01:00.000Z',
    }];
    await act(async () => subscriber.onRunFinalized?.());
    await waitFor(() => expect(historyRequests).toBe(2));
    expect(runtimeMocks.setMessages).toHaveBeenCalledWith([]);
    await act(async () => runResolvers.shift()?.());

    await user.type(screen.getByPlaceholderText('Message Supplier research'), 'Compare the next option.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-second-reply', role: 'assistant', content: 'New provider reply' }],
    }));

    await waitFor(() => expect(screen.getAllByText('Provider reply')).toHaveLength(1));
    expect(screen.getByText('New provider reply')).toBeVisible();
    await act(async () => runResolvers.shift()?.());
  });

  it('keeps the live response visible when the terminal provider-history refresh fails', async () => {
    let historyFails = false;
    let historyRequests = 0;
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) {
        historyRequests += 1;
        return historyFails ? Promise.reject(new Error('history unavailable')) : Promise.resolve([] as never);
      }
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
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
      event: {
        name: 'kiditem.provider_tool_status',
        value: { name: 'source_search', status: 'running' },
      },
    }));
    historyFails = true;
    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(historyRequests).toBe(2));
    expect(screen.getByText('Provider reply')).toBeVisible();
    expect(screen.getByText('source_search')).toBeVisible();
    expect(runtimeMocks.setMessages).not.toHaveBeenCalled();
    await act(async () => resolveRun?.());
  });

  it('keeps live text and tool status when a successful provider-history refresh has not flushed the terminal reply', async () => {
    let historyRequests = 0;
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) {
        historyRequests += 1;
        return Promise.resolve([] as never);
      }
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
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
      event: {
        name: 'kiditem.provider_tool_status',
        value: { name: 'source_search', status: 'running' },
      },
    }));
    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(historyRequests).toBe(2));
    expect(screen.getByText('Provider reply')).toBeVisible();
    expect(screen.getByText('source_search')).toBeVisible();
    expect(runtimeMocks.setMessages).not.toHaveBeenCalled();
    await act(async () => resolveRun?.());
  });

  it('clears preserved live state when a later provider-history refresh finally covers the terminal reply', async () => {
    let history: unknown[] = [];
    let resolveRun: (() => void) | undefined;
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) return Promise.resolve(history as never);
      return Promise.resolve([] as never);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    renderSurface(queryClient);
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onRunFinalized?: () => void;
    };

    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-reply', role: 'assistant', content: 'Provider reply' }],
    }));
    await act(async () => subscriber.onRunFinalized?.());
    expect(screen.getByText('Provider reply')).toBeVisible();
    expect(runtimeMocks.setMessages).not.toHaveBeenCalled();

    history = [{
      id: 'history-reply', role: 'assistant', content: 'Provider reply',
      createdAt: '2026-08-26T00:01:00.000Z',
    }];
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ['agent-os', 'conversations', 'history', CONVERSATION.id],
        type: 'active',
      });
    });

    await waitFor(() => expect(runtimeMocks.setMessages).toHaveBeenCalledWith([]));
    await waitFor(() => expect(screen.getAllByText('Provider reply')).toHaveLength(1));
    await act(async () => resolveRun?.());
  });

  it('waits for an initial provider-history baseline before starting and later reconciles the turn', async () => {
    let history: unknown[] = [];
    let historyRequests = 0;
    let resolveInitialHistory: ((messages: unknown[]) => void) | undefined;
    let resolveRun: (() => void) | undefined;
    const initialHistory = new Promise<unknown[]>((resolve) => { resolveInitialHistory = resolve; });
    runtimeMocks.runAgent.mockImplementation(() => new Promise<void>((resolve) => { resolveRun = resolve; }));
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION] as never);
      if (path.endsWith('/history')) {
        historyRequests += 1;
        return (historyRequests === 1 ? initialHistory : Promise.resolve(history)) as never;
      }
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
    await act(async () => resolveInitialHistory?.([]));
    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0] as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onRunFinalized?: () => void;
    };
    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-reply', role: 'assistant', content: 'Provider reply' }],
    }));
    history = [{
      id: 'history-reply', role: 'assistant', content: 'Provider reply',
      createdAt: '2026-08-26T00:01:00.000Z',
    }];
    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(runtimeMocks.setMessages).toHaveBeenCalledWith([]));
    await waitFor(() => expect(screen.getAllByText('Provider reply')).toHaveLength(1));
    await act(async () => resolveRun?.());
  });

  it('does not start a stale provider turn when the conversation changes during baseline loading', async () => {
    const secondConversation = {
      ...CONVERSATION,
      id: 'conversation-2',
      title: 'Second conversation',
      updatedAt: '2026-08-26T00:02:00.000Z',
    };
    let resolveInitialHistory: ((messages: unknown[]) => void) | undefined;
    const initialHistory = new Promise<unknown[]>((resolve) => { resolveInitialHistory = resolve; });
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([CONVERSATION, secondConversation] as never);
      if (path.includes(`/${CONVERSATION.id}/history`)) return initialHistory as never;
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve([] as never);
    });
    const user = userEvent.setup();
    renderSurface();
    await user.type(await screen.findByPlaceholderText('Message Supplier research'), 'Review the evidence.');
    await user.selectOptions(screen.getByLabelText('Model'), 'gpt-5.6');
    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'low');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();

    act(() => useConversationSurfaceState.getState().selectConversation(secondConversation));
    expect(await screen.findByRole('heading', { name: 'Second conversation' })).toBeVisible();
    await act(async () => {
      resolveInitialHistory?.([]);
      await initialHistory;
    });

    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
    expect(runtimeMocks.addMessage).not.toHaveBeenCalled();
  });
});
