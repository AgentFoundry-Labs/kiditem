import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  ConversationRuntimeHost,
  useConversationRuntime,
  type ConversationRuntimeContextValue,
} from '../ConversationRuntimeHost';
import { ConversationFolderTree } from '../ConversationFolderTree';
import { useConversationSurfaceState } from '../conversation-surface-state';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const runtimeMocks = vi.hoisted(() => {
  const subscriptions: Array<{ unsubscribe: ReturnType<typeof vi.fn>; subscriber: Record<string, unknown> }> = [];
  const runAgent = vi.fn();
  const addMessage = vi.fn();
  const setMessages = vi.fn();
  const useAgent = vi.fn();
  const subscribe = vi.fn((subscriber: Record<string, unknown>) => {
    const subscription = { unsubscribe: vi.fn(), subscriber };
    subscriptions.push(subscription);
    return subscription;
  });
  const agent = {
    addMessage,
    runAgent,
    setMessages,
    subscribe,
  };
  return { subscriptions, runAgent, addMessage, setMessages, useAgent, subscribe, agent };
});

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: (input: unknown) => {
    runtimeMocks.useAgent(input);
    return { agent: runtimeMocks.agent, isReady: true };
  },
}));

const FIRST = {
  id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const,
  title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
};
const SECOND = {
  ...FIRST, id: 'conversation-2', title: 'Second conversation', updatedAt: '2026-08-26T00:01:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

let latestRuntime: ConversationRuntimeContextValue | null = null;

function RuntimeProbe() {
  latestRuntime = useConversationRuntime();
  return (
    <output data-testid="runtime-probe">
      {latestRuntime.conversationId}|{latestRuntime.activeTurnId ?? 'idle'}|
      {latestRuntime.liveMessages.map((message) => message.content).join(',')}|
      {latestRuntime.toolProjections.map((projection) => projection.title).join(',')}
    </output>
  );
}

function SettingsTriggers() {
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  return (
    <>
      <button type="button" aria-label="패널 대화 설정" onClick={(event) => openSettings(event.currentTarget)}>패널 설정</button>
      <ConversationFolderTree
        conversations={[]}
        selectedContext={null}
        activeConversationId={null}
        onSelectContext={vi.fn()}
        onSelectConversation={vi.fn()}
        onNewConversation={vi.fn()}
        onOpenSettings={openSettings}
      />
    </>
  );
}

function renderHost(
  children: React.ReactNode,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationRuntimeHost>{children}</ConversationRuntimeHost>
    </QueryClientProvider>,
  );
}

describe('ConversationRuntimeHost', () => {
  beforeEach(() => {
    latestRuntime = null;
    vi.clearAllMocks();
    runtimeMocks.subscriptions.length = 0;
    useConversationSurfaceState.getState().reset();
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([FIRST, SECOND] as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      return Promise.resolve({} as never);
    });
  });

  it('binds a draft to its reserved ID without provider create, history, durable writes, or a CopilotKit run', async () => {
    renderHost(<RuntimeProbe />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/agent-os/conversations'));
    vi.clearAllMocks();

    act(() => useConversationSurfaceState.getState().openConversation({
      fixedAgentKey: 'sourcing',
      draft: 'Review the supplier evidence.',
    }));

    await waitFor(() => expect(runtimeMocks.useAgent).toHaveBeenCalledWith({
      agentId: expect.stringMatching(/^kiditem-conversation:/),
      runtimeAgentId: 'conversation',
      threadId: useConversationSurfaceState.getState().pendingDraft?.conversationId,
    }));
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/history$/));
    expect(runtimeMocks.addMessage).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('promotes one reserved draft through one create and one exact run without recreating its binding', async () => {
    renderHost(<RuntimeProbe />);
    const draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
    useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    const promoted = {
      ...FIRST,
      id: draft.conversationId,
      title: 'Review the supplier evidence',
    };
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve(promoted as never);
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      return Promise.resolve({} as never);
    });

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const first = latestRuntime?.start({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    const second = latestRuntime?.start({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await Promise.all([first, second]);

    expect(apiClient.post).toHaveBeenCalledWith('/api/agent-os/conversations', {
      conversationId: draft.conversationId,
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Review the supplier evidence',
    });
    expect(runtimeMocks.addMessage).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user', content: 'Review the supplier evidence',
    }));
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    }));
    expect(runtimeMocks.subscriptions).toHaveLength(1);
  });

  it('does not replace a newer draft or run a disposed draft after its create resolves', async () => {
    renderHost(<RuntimeProbe />);
    const firstDraft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
    useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    const created = deferred<typeof FIRST>();
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return created.promise as never;
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      return Promise.resolve({} as never);
    });

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const firstSend = latestRuntime?.start({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await waitFor(() => expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
      '/api/agent-os/conversations',
      expect.objectContaining({ conversationId: firstDraft.conversationId }),
    ));

    const secondDraft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
    useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    await waitFor(() => expect(runtimeMocks.useAgent).toHaveBeenLastCalledWith({
      agentId: `kiditem-conversation:${secondDraft.conversationId}`,
      runtimeAgentId: 'conversation',
      threadId: secondDraft.conversationId,
    }));

    await act(async () => {
      created.resolve({ ...FIRST, id: firstDraft.conversationId, title: 'Review the supplier evidence' });
      await firstSend;
    });

    expect(useConversationSurfaceState.getState().activeConversationId).toBe(secondDraft.conversationId);
    expect(runtimeMocks.addMessage).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('does not replay a failed first handoff; an explicit retry uses the promoted existing conversation', async () => {
    let conversations = [FIRST, SECOND];
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve(conversations as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    renderHost(<RuntimeProbe />);
    const draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
    useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    const promoted = { ...FIRST, id: draft.conversationId, title: 'Review the supplier evidence' };
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') {
        conversations = [promoted, ...conversations.filter((item) => item.id !== promoted.id)];
        return Promise.resolve(promoted as never);
      }
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      return Promise.resolve({} as never);
    });
    runtimeMocks.runAgent
      .mockRejectedValueOnce(new Error('provider ended'))
      .mockResolvedValueOnce(undefined);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await expect(latestRuntime?.start({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    })).rejects.toThrow('conversation_turn_ended');
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(latestRuntime?.isDraft).toBe(false));
    expect(latestRuntime?.draft).toMatchObject({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });

    await latestRuntime?.start({
      message: 'Try the same request again', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.runAgent.mock.calls[1][0].runId)
      .not.toBe(runtimeMocks.runAgent.mock.calls[0][0].runId);
    expect(vi.mocked(apiClient.post).mock.calls.filter(([path]) => path === '/api/agent-os/conversations'))
      .toHaveLength(1);
  });

  it('rejects a missing per-turn model or reasoning effort instead of applying a fallback', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));

    await expect(latestRuntime?.start({
      message: 'Review evidence', model: '', reasoningEffort: 'low',
    })).rejects.toThrow('conversation_model_required');
    await expect(latestRuntime?.start({
      message: 'Review evidence', model: 'gpt-5.6', reasoningEffort: '',
    })).rejects.toThrow('conversation_reasoning_effort_required');
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
  });

  it('maps a rejected readiness request to retryable unavailable state without selecting a saved pair', async () => {
    const remembered = { ...FIRST, lastModel: 'gpt-5.6', lastReasoningEffort: 'low' };
    useConversationSurfaceState.getState().selectConversation(remembered);
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([remembered] as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    let readinessRequests = 0;
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path !== '/api/copilotkit') return Promise.resolve({} as never);
      readinessRequests += 1;
      if (readinessRequests === 1) return Promise.reject(new Error('gateway unavailable'));
      return Promise.resolve({
        agents: { conversation: { capabilities: { custom: { gatewayReadiness: [{
          runtime: 'codex_cli', ready: true,
          readiness: {
            runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
            modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
            loginVerified: true, mcpProtocolRevision: '2026-07-28',
          },
        }, { runtime: 'claude_cli', ready: false, code: 'selected_engine_unavailable' }] } } } },
      } as never);
    });

    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(latestRuntime?.readiness).toBeNull());
    expect(latestRuntime?.turnPreference).toEqual({
      model: null, reasoningEffort: null, needsReview: false,
    });

    act(() => latestRuntime?.retryReadiness());

    await waitFor(() => expect(readinessRequests).toBe(2));
    await waitFor(() => expect(latestRuntime?.readiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ runtime: 'codex_cli', ready: true }),
    ])));
  });

  it('refreshes ordered conversation summaries after a terminal completion without another runtime subscription', async () => {
    const completed = {
      ...FIRST,
      updatedAt: '2026-08-26T00:02:00.000Z',
      lastModel: 'gpt-5.6',
      lastReasoningEffort: 'low',
    };
    let conversations = [FIRST, SECOND];
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve(conversations as never);
      if (path.endsWith('/history')) return Promise.resolve([] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await waitFor(() => expect(latestRuntime?.conversations).toEqual([FIRST, SECOND]));
    conversations = [SECOND, completed];
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onRunFinalized?: () => void;
    };

    await act(async () => subscriber.onRunFinalized?.());

    await waitFor(() => expect(latestRuntime?.conversations).toEqual([SECOND, completed]));
    expect(latestRuntime?.activeConversation).toMatchObject({
      id: FIRST.id,
      lastModel: 'gpt-5.6',
      lastReasoningEffort: 'low',
    });
    expect(runtimeMocks.subscriptions).toHaveLength(1);
  });

  it('applies only a supported matching preference pair to a newly selected draft', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([] as never);
      return Promise.resolve({
        schemaVersion: 1,
        contexts: { sourcing: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' } } },
      } as never);
    });
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path !== '/api/copilotkit') return Promise.resolve({} as never);
      return Promise.resolve({
        agents: { conversation: { capabilities: { custom: { gatewayReadiness: [{
          runtime: 'codex_cli', ready: true,
          readiness: {
            runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
            modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
            loginVerified: true, mcpProtocolRevision: '2026-07-28',
          },
        }, { runtime: 'claude_cli', ready: false, code: 'selected_engine_unavailable' }] } } } },
      } as never);
    });
    renderHost(<RuntimeProbe />);
    act(() => {
      useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/copilotkit', {
      method: 'info', params: {}, body: {},
    }));
    await waitFor(() => expect(latestRuntime?.readiness).not.toBeUndefined());
    expect(latestRuntime?.readiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ runtime: 'codex_cli', ready: true }),
    ]));
    expect(latestRuntime?.preferences).toEqual(expect.objectContaining({
      contexts: expect.objectContaining({ sourcing: expect.any(Object) }),
    }));
    await waitFor(() => expect(latestRuntime?.turnPreference).toEqual({
      model: 'gpt-5.6', reasoningEffort: 'low', needsReview: false,
    }));
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      model: 'gpt-5.6', reasoningEffort: 'low',
    });
  });

  it('mounts exactly one settings dialog for panel and tree triggers, returning focus to each trigger', async () => {
    renderHost(<SettingsTriggers />);
    await screen.findByRole('navigation', { name: '대화 목록' });
    const panelTrigger = screen.getByRole('button', { name: '패널 대화 설정' });
    act(() => panelTrigger.focus());
    act(() => panelTrigger.click());
    expect(screen.getAllByRole('dialog', { name: '대화 설정' })).toHaveLength(1);
    screen.getByRole('button', { name: '닫기' }).click();
    await waitFor(() => expect(panelTrigger).toHaveFocus());

    const treeTrigger = screen.getByRole('button', { name: '대화 설정' });
    act(() => treeTrigger.focus());
    act(() => treeTrigger.click());
    expect(screen.getAllByRole('dialog', { name: '대화 설정' })).toHaveLength(1);
    screen.getByRole('button', { name: '닫기' }).click();
    await waitFor(() => expect(treeTrigger).toHaveFocus());
  });

  it('keeps one subscription and the active turn, live messages, tool projections, and interrupt across presentation route remounts', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const running = deferred<void>();
    runtimeMocks.runAgent.mockReturnValue(running.promise);
    const view = renderHost(<RuntimeProbe />, queryClient);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    act(() => { void latestRuntime?.start({ message: 'Review evidence', model: 'gpt-5.6', reasoningEffort: 'low' }); });
    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1));
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onMessagesChanged?: (input: { messages: unknown[] }) => void;
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
    };
    await act(async () => subscriber.onMessagesChanged?.({
      messages: [{ id: 'live-1', role: 'assistant', content: 'Provider reply' }],
    }));
    await act(async () => subscriber.onCustomEvent?.({
      event: { name: 'kiditem.provider_tool_status', value: { name: 'source_search', status: 'running' } },
    }));

    view.rerender(<QueryClientProvider client={queryClient}>
      <ConversationRuntimeHost>{null}</ConversationRuntimeHost>
    </QueryClientProvider>);
    view.rerender(<QueryClientProvider client={queryClient}>
      <ConversationRuntimeHost><RuntimeProbe /></ConversationRuntimeHost>
    </QueryClientProvider>);

    expect(runtimeMocks.subscriptions).toHaveLength(1);
    expect(runtimeMocks.subscriptions[0].unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByTestId('runtime-probe')).toHaveTextContent('Provider reply');
    expect(screen.getByTestId('runtime-probe')).toHaveTextContent('source_search');
    await act(async () => latestRuntime?.interrupt());
    expect(apiClient.post).toHaveBeenCalledWith(expect.stringMatching(/\/interrupt$/));
    running.resolve();
  });

  it('disposes the old subscription before binding the exact newly selected conversation', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const firstSubscription = runtimeMocks.subscriptions[0];
    act(() => useConversationSurfaceState.getState().selectConversation(SECOND));

    await waitFor(() => expect(runtimeMocks.useAgent).toHaveBeenLastCalledWith({
      agentId: 'kiditem-conversation:conversation-2', runtimeAgentId: 'conversation', threadId: 'conversation-2',
    }));
    expect(firstSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.subscriptions).toHaveLength(2);
    expect(firstSubscription.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeMocks.subscribe.mock.invocationCallOrder[1],
    );
  });
});
