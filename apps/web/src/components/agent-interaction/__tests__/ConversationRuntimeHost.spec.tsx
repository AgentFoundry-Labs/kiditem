import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  ConversationRuntimeHost,
  useConversationRuntime,
  type ConversationRuntimeContextValue,
} from '../ConversationRuntimeHost';
import { useConversationSurfaceState } from '../conversation-surface-state';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const runtimeMocks = vi.hoisted(() => {
  const subscriptions: Array<{ unsubscribe: ReturnType<typeof vi.fn>; subscriber: Record<string, unknown> }> = [];
  const runAgent = vi.fn();
  const addMessage = vi.fn();
  const abortRun = vi.fn();
  const connectAgent = vi.fn();
  const useAgent = vi.fn();
  const subscribe = vi.fn((subscriber: Record<string, unknown>) => {
    const subscription = { unsubscribe: vi.fn(), subscriber };
    subscriptions.push(subscription);
    return subscription;
  });
  const agent = {
    messages: [] as unknown[],
    isRunning: false,
    addMessage,
    runAgent,
    abortRun,
    connectAgent,
    subscribe,
  };
  let isReady = true;
  return {
    subscriptions,
    runAgent,
    addMessage,
    abortRun,
    connectAgent,
    subscribe,
    useAgent,
    agent,
    get isReady() { return isReady; },
    set isReady(value: boolean) { isReady = value; },
  };
});

vi.mock('@copilotkit/react-core/v2', () => ({
  useCopilotKit: () => ({
    copilotkit: { connectAgent: runtimeMocks.connectAgent },
  }),
  useAgent: (input: unknown) => {
    runtimeMocks.useAgent(input);
    runtimeMocks.subscribe.mockName('agent.subscribe');
    return { agent: runtimeMocks.agent, isReady: runtimeMocks.isReady };
  },
}));

const FIRST = {
  id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const,
  title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
};
const SECOND = {
  ...FIRST, id: 'conversation-2', title: 'Second conversation', updatedAt: '2026-08-26T00:01:00.000Z',
};
const IDENTITY = { userId: 'user-a', organizationId: 'org-a' };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let latestRuntime: ConversationRuntimeContextValue | null = null;

function RuntimeProbe() {
  latestRuntime = useConversationRuntime();
  return (
    <output data-testid="runtime-probe">
      {latestRuntime.conversationId}|{latestRuntime.isRunning ? 'running' : 'idle'}|
      {latestRuntime.messages.map((message) => message.content).join(',')}
    </output>
  );
}

function TerminalNoticeProbe() {
  const { turnEnded } = useConversationRuntime();
  return <output data-testid="terminal-notice">{turnEnded ?? ''}</output>;
}

function SettingsTrigger() {
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  return <button type="button" onClick={(event) => openSettings(event.currentTarget)}>설정 열기</button>;
}

function renderHost(
  children: React.ReactNode,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationRuntimeHost identity={IDENTITY}>{children}</ConversationRuntimeHost>
    </QueryClientProvider>,
  );
}

describe('ConversationRuntimeHost', () => {
  beforeEach(() => {
    latestRuntime = null;
    vi.clearAllMocks();
    let uuid = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuid}`) });
    runtimeMocks.runAgent.mockReset();
    runtimeMocks.runAgent.mockResolvedValue(undefined);
    runtimeMocks.addMessage.mockReset();
    runtimeMocks.abortRun.mockReset();
    runtimeMocks.connectAgent.mockReset();
    runtimeMocks.connectAgent.mockResolvedValue(undefined);
    runtimeMocks.useAgent.mockReset();
    runtimeMocks.abortRun.mockImplementation(() => { runtimeMocks.agent.isRunning = false; });
    runtimeMocks.subscribe.mockClear();
    runtimeMocks.subscriptions.length = 0;
    runtimeMocks.agent.messages = [];
    runtimeMocks.agent.isRunning = false;
    runtimeMocks.isReady = true;
    useConversationSurfaceState.getState().reset();
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/api/agent-os/conversations') return Promise.resolve([FIRST, SECOND] as never);
      return Promise.resolve({ schemaVersion: 1, contexts: {} } as never);
    });
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      return Promise.resolve({} as never);
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('binds a draft to its one reserved ID without a create, history request, durable write, or CopilotKit run', async () => {
    renderHost(<RuntimeProbe />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/agent-os/conversations'));
    vi.clearAllMocks();

    act(() => useConversationSurfaceState.getState().openConversation({
      fixedAgentKey: 'sourcing',
      draft: 'Review the supplier evidence.',
    }));

    await waitFor(() => expect(latestRuntime?.conversationId).toBe('uuid-1'));
    expect(runtimeMocks.useAgent).toHaveBeenLastCalledWith({
      agentId: 'kiditem-conversation:uuid-1',
      runtimeAgentId: 'conversation',
      threadId: 'uuid-1',
    });
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'uuid-1', agentKey: 'sourcing', message: 'Review the supplier evidence.',
    });
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/history$/));
    expect(runtimeMocks.addMessage).not.toHaveBeenCalled();
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();
    expect(runtimeMocks.connectAgent).not.toHaveBeenCalled();
  });

  it('connects one ready existing binding once and projects its CopilotKit snapshot without connecting a draft', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    runtimeMocks.connectAgent.mockImplementation(async () => {
      runtimeMocks.agent.messages = [{
        id: 'snapshot-assistant-1', role: 'assistant', content: 'Stored CopilotKit reply',
      }];
      for (const subscription of runtimeMocks.subscriptions) {
        (subscription.subscriber as { onMessagesChanged?: () => void }).onMessagesChanged?.();
      }
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ConversationRuntimeHost identity={IDENTITY}><RuntimeProbe /></ConversationRuntimeHost>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(runtimeMocks.connectAgent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('runtime-probe')).toHaveTextContent(
      'conversation-1|idle|Stored CopilotKit reply',
    ));

    view.rerender(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ConversationRuntimeHost identity={IDENTITY}>{null}</ConversationRuntimeHost>
        </QueryClientProvider>
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ConversationRuntimeHost identity={IDENTITY}><RuntimeProbe /></ConversationRuntimeHost>
        </QueryClientProvider>
      </StrictMode>,
    );
    expect(runtimeMocks.connectAgent).toHaveBeenCalledTimes(1);

    act(() => useConversationSurfaceState.getState().selectConversation(SECOND));
    await waitFor(() => expect(runtimeMocks.connectAgent).toHaveBeenCalledTimes(2));
    expect(runtimeMocks.useAgent).toHaveBeenLastCalledWith({
      agentId: 'kiditem-conversation:conversation-2',
      runtimeAgentId: 'conversation',
      threadId: 'conversation-2',
    });
  });

  it('waits for the first exact binding connection before handing a promoted draft to runAgent', async () => {
    const connected = deferred<void>();
    runtimeMocks.connectAgent.mockReturnValue(connected.promise);
    renderHost(<RuntimeProbe />);
    let draft!: ReturnType<typeof useConversationSurfaceState.getState.openConversation>;
    act(() => {
      draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });
    const promoted = { ...FIRST, id: draft.conversationId, title: 'Wait for snapshot' };
    vi.mocked(apiClient.post).mockImplementation((path: string) => (
      path === '/api/agent-os/conversations'
        ? Promise.resolve(promoted as never)
        : Promise.resolve({ agents: {} } as never)
    ));

    const firstSend = latestRuntime!.start({
      message: 'Wait for snapshot', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await waitFor(() => expect(runtimeMocks.connectAgent).toHaveBeenCalledTimes(1));
    expect(runtimeMocks.runAgent).not.toHaveBeenCalled();

    await act(async () => {
      connected.resolve();
      await firstSend;
    });
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1);
  });

  it('promotes matching concurrent first sends through one exact create and one CopilotKit handoff', async () => {
    renderHost(<RuntimeProbe />);
    let draft!: ReturnType<typeof useConversationSurfaceState.getState.openConversation>;
    act(() => {
      draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });
    const promoted = { ...FIRST, id: draft.conversationId, title: 'Review the supplier evidence' };
    vi.mocked(apiClient.post).mockImplementation((path: string) => (
      path === '/api/agent-os/conversations'
        ? Promise.resolve(promoted as never)
        : Promise.resolve({ agents: {} } as never)
    ));

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const first = latestRuntime!.start({
      message: 'Review the supplier evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    const second = latestRuntime!.start({
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
    expect(runtimeMocks.addMessage).toHaveBeenCalledWith({
      id: `user-uuid-2`, role: 'user', content: 'Review the supplier evidence',
    });
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.runAgent).toHaveBeenCalledWith({
      runId: 'uuid-2',
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    });
    expect(runtimeMocks.subscriptions).toHaveLength(1);
    expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: draft.conversationId,
      pendingDraft: null,
    });
  });

  it('clears only a failed create attempt so the same draft ID can retry', async () => {
    renderHost(<RuntimeProbe />);
    let draft!: ReturnType<typeof useConversationSurfaceState.getState.openConversation>;
    act(() => {
      draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });
    const promoted = { ...FIRST, id: draft.conversationId, title: 'Retry this message' };
    let createAttempts = 0;
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/api/copilotkit') return Promise.resolve({ agents: {} } as never);
      if (path !== '/api/agent-os/conversations') return Promise.resolve({} as never);
      createAttempts += 1;
      return createAttempts === 1
        ? Promise.reject(new Error('gateway unavailable')) as never
        : Promise.resolve(promoted as never);
    });

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await expect(latestRuntime!.start({
      message: 'Retry this message', model: 'gpt-5.6', reasoningEffort: 'low',
    })).rejects.toThrow('gateway unavailable');
    expect(useConversationSurfaceState.getState().pendingDraft?.conversationId).toBe(draft.conversationId);

    await latestRuntime!.start({
      message: 'Retry this message', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    const creates = vi.mocked(apiClient.post).mock.calls.filter(([path]) => path === '/api/agent-os/conversations');
    expect(creates).toHaveLength(2);
    expect(creates.map(([, input]) => (input as { conversationId: string }).conversationId))
      .toEqual([draft.conversationId, draft.conversationId]);
  });

  it('keeps a failed first handoff consumed and retries it as a normal existing-conversation turn', async () => {
    renderHost(<RuntimeProbe />);
    let draft!: ReturnType<typeof useConversationSurfaceState.getState.openConversation>;
    act(() => {
      draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });
    const promoted = { ...FIRST, id: draft.conversationId, title: 'First request' };
    vi.mocked(apiClient.post).mockImplementation((path: string) => (
      path === '/api/agent-os/conversations'
        ? Promise.resolve(promoted as never)
        : Promise.resolve({ agents: {} } as never)
    ));
    runtimeMocks.runAgent
      .mockRejectedValueOnce(new Error('provider ended'))
      .mockResolvedValueOnce(undefined);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await expect(latestRuntime!.start({
      message: 'First request', model: 'gpt-5.6', reasoningEffort: 'low',
    })).rejects.toThrow('conversation_turn_ended');
    await waitFor(() => expect(latestRuntime?.isDraft).toBe(false));

    await latestRuntime!.start({
      message: 'Try again', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.runAgent.mock.calls[1][0].runId)
      .not.toBe(runtimeMocks.runAgent.mock.calls[0][0].runId);
    expect(vi.mocked(apiClient.post).mock.calls.filter(([path]) => path === '/api/agent-os/conversations'))
      .toHaveLength(1);
  });

  it('does not create a draft before the exact CopilotKit binding is ready', async () => {
    runtimeMocks.isReady = false;
    renderHost(<RuntimeProbe />);
    let draft!: ReturnType<typeof useConversationSurfaceState.getState.openConversation>;
    act(() => {
      draft = useConversationSurfaceState.getState().openConversation({ fixedAgentKey: 'sourcing' });
      useConversationSurfaceState.getState().updateDraft({ provider: 'codex_cli' });
    });

    await expect(latestRuntime!.start({
      message: 'Wait for the binding', model: 'gpt-5.6', reasoningEffort: 'low',
    })).rejects.toThrow('conversation_runtime_not_ready');
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/agent-os/conversations', expect.anything());
    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: draft.conversationId,
      message: 'Wait for the binding',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    });
  });

  it('projects CopilotKit running state through presentation remounts without rendering provider tool metadata', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    const running = deferred<void>();
    runtimeMocks.runAgent.mockImplementation(() => {
      runtimeMocks.agent.isRunning = true;
      return running.promise;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHost(<RuntimeProbe />, queryClient);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const start = latestRuntime!.start({
      message: 'Review evidence', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1));
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onRunInitialized?: () => void;
      onRunFinalized?: () => void;
      onMessagesChanged?: () => void;
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
    };
    runtimeMocks.agent.isRunning = true;
    act(() => subscriber.onRunInitialized?.());
    runtimeMocks.agent.messages = [{ id: 'assistant-1', role: 'assistant', content: 'Provider reply' }];
    await act(async () => subscriber.onMessagesChanged?.());
    await act(async () => subscriber.onCustomEvent?.({
      event: {
        name: 'kiditem.provider_tool_status',
        value: {
          name: 'mcp__kiditem__capability_invoke',
          status: 'started',
          detail: 'transport-token: do-not-render',
        },
      },
    }));

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationRuntimeHost identity={IDENTITY}>{null}</ConversationRuntimeHost>
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationRuntimeHost identity={IDENTITY}><RuntimeProbe /></ConversationRuntimeHost>
      </QueryClientProvider>,
    );

    expect(runtimeMocks.subscriptions).toHaveLength(1);
    expect(runtimeMocks.subscriptions[0].unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByTestId('runtime-probe')).toHaveTextContent('conversation-1|running|Provider reply');
    expect(latestRuntime).not.toHaveProperty('activeTurnId');
    expect(latestRuntime).not.toHaveProperty('toolProjections');
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('mcp__kiditem__capability_invoke');
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('transport-token: do-not-render');
    await act(async () => latestRuntime!.interrupt());
    expect(runtimeMocks.abortRun).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/turns\/[^/]+\/stop$/));
    runtimeMocks.agent.isRunning = false;
    act(() => subscriber.onRunFinalized?.());
    expect(latestRuntime?.isRunning).toBe(false);
    await act(async () => {
      running.resolve();
      await start;
    });
  });

  it('keeps a successfully finalized turn free of terminal copy after a prior runtime failure', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<TerminalNoticeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onRunFailed?: () => void;
      onRunFinalized?: () => void;
    };

    act(() => subscriber.onRunFailed?.());
    expect(screen.getByTestId('terminal-notice')).toHaveTextContent(
      '응답을 완료하지 못했습니다. 다시 시도해 주세요.',
    );

    act(() => subscriber.onRunFinalized?.());
    expect(screen.getByTestId('terminal-notice')).toBeEmptyDOMElement();
    expect(screen.getByTestId('terminal-notice')).not.toHaveTextContent(
      'This turn ended. Send a new message when you are ready.',
    );
  });

  it('keeps raw tool and status role content out of the conversation transcript', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onMessagesChanged?: () => void;
    };
    runtimeMocks.agent.messages = [
      { id: 'user-1', role: 'user', content: '상품 후보를 비교해 주세요.' },
      { id: 'tool-1', role: 'tool', content: 'mcp__kiditem__capability_invoke private payload' },
      { id: 'status-1', role: 'status', content: 'transport-token: do-not-render' },
      { id: 'assistant-1', role: 'assistant', content: '비교 결과를 정리했습니다.' },
    ];
    await act(async () => subscriber.onMessagesChanged?.());

    expect(latestRuntime?.messages).toEqual([
      { id: 'user-1', role: 'user', content: '상품 후보를 비교해 주세요.' },
      { id: 'assistant-1', role: 'assistant', content: '비교 결과를 정리했습니다.' },
    ]);
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('mcp__kiditem__capability_invoke');
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('transport-token: do-not-render');
  });

  it('suppresses a generic provider tool completion with no safe business label', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const subscriber = runtimeMocks.subscriptions[0].subscriber as {
      onCustomEvent?: (input: { event: { name: string; value: unknown } }) => void;
    };
    await act(async () => subscriber.onCustomEvent?.({
      event: {
        name: 'kiditem.provider_tool_status',
        value: { name: 'provider.tool.completed', status: 'completed', detail: 'private result details' },
      },
    }));

    expect(latestRuntime).not.toHaveProperty('toolProjections');
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('업무 처리');
    expect(screen.getByTestId('runtime-probe')).not.toHaveTextContent('private result details');
  });

  it('interrupts an active CopilotKit run without a browser-owned turn identifier', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    const run = deferred<void>();
    runtimeMocks.runAgent.mockImplementation(() => {
      runtimeMocks.agent.isRunning = true;
      return run.promise;
    });
    renderHost(<RuntimeProbe />);
    await waitFor(() => expect(latestRuntime?.conversationId).toBe(FIRST.id));

    const start = latestRuntime!.start({
      message: 'Stop this turn', model: 'gpt-5.6', reasoningEffort: 'low',
    });
    await waitFor(() => expect(runtimeMocks.runAgent).toHaveBeenCalledTimes(1));
    expect(latestRuntime).not.toHaveProperty('activeTurnId');
    await act(async () => latestRuntime!.interrupt());
    expect(runtimeMocks.abortRun).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/turns\/[^/]+\/stop$/));

    await act(async () => {
      runtimeMocks.agent.isRunning = false;
      run.resolve();
      await start;
    });
  });

  it('uses CopilotKit running state rather than a local turn identifier to decide whether interruption is available', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    runtimeMocks.agent.isRunning = true;
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(latestRuntime?.conversationId).toBe('conversation-1'));
    expect(latestRuntime).not.toHaveProperty('activeTurnId');
    await act(async () => latestRuntime!.interrupt());

    expect(apiClient.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/turns\/[^/]+\/stop$/));
    expect(runtimeMocks.abortRun).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous subscription before binding a different selected conversation', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    const firstSubscription = runtimeMocks.subscriptions[0];
    act(() => useConversationSurfaceState.getState().selectConversation(SECOND));

    await waitFor(() => expect(latestRuntime?.conversationId).toBe(SECOND.id));
    expect(firstSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.subscriptions).toHaveLength(2);
    expect(firstSubscription.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeMocks.subscribe.mock.invocationCallOrder[1],
    );
  });

  it('does not expose a web history query, history context, or reconciliation cache', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    renderHost(<RuntimeProbe />);

    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => String(path)))
      .not.toContain('/api/agent-os/conversations/conversation-1/history');
    expect(latestRuntime).not.toHaveProperty('historyMessages');
    expect(latestRuntime).not.toHaveProperty('liveMessages');
  });

  it('keeps the open history settings view and its delete result while removing the selected terminal conversation', async () => {
    useConversationSurfaceState.getState().selectConversation(FIRST);
    vi.mocked(apiClient.delete).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderHost(<SettingsTrigger />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/agent-os/conversations'));
    await waitFor(() => expect(runtimeMocks.subscriptions).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '설정 열기' }));
    await user.click(await screen.findByRole('tab', { name: '채팅 기록' }));
    await user.click(screen.getByRole('button', { name: '전체 대화 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2개 대화를 삭제했습니다.'));
    expect(screen.getByRole('tab', { name: '채팅 기록' })).toHaveAttribute('aria-selected', 'true');
  });
});
