import { createElement, type ComponentType } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { AgentInteractionPanel } from '../AgentInteractionPanel';
import { AgentInteractionProvider } from '../AgentInteractionProvider';
import { resetInteractionStore } from '../interaction-store';
import { bootstrap, existingSession, makeQueryClient } from './test-fixtures';

const copilotRun = vi.hoisted(() => vi.fn());
const copilotConnect = vi.hoisted(() => vi.fn());
const providerProps = vi.hoisted(() => vi.fn());
const chatError = vi.hoisted(() => ({
  handler: null as null | ((event: {
    error: Error;
    code: string;
    context: Record<string, unknown>;
  }) => void),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn() },
}));

vi.mock('@copilotkit/react-core/v2', () => {
  const View = ({
    onSubmitMessage,
    inputValue,
    onInputChange,
  }: {
    onSubmitMessage?: (value: string) => void;
    inputValue?: string;
    onInputChange?: (value: string) => void;
  }) => createElement('div', {},
    createElement('textarea', {
      'aria-label': '메시지',
      value: inputValue ?? '',
      onChange: (event: { target: { value: string } }) => onInputChange?.(event.target.value),
    }),
    createElement('button', {
      type: 'button',
      onClick: () => onSubmitMessage?.(inputValue ?? ''),
    }, '전송'),
  );

  const Chat = vi.fn((props: {
    agentId: string;
    threadId: string;
    chatView?: ComponentType<Record<string, unknown>>;
    onError?: (event: { error: Error; code: string; context: Record<string, unknown> }) => void;
  }) => {
    chatError.handler = props.onError ?? null;
    copilotConnect({ agentId: props.agentId, threadId: props.threadId });
    const ChatView = props.chatView ?? View;
    return createElement(ChatView, {
      onSubmitMessage: (message: string) => copilotRun({
        agentId: props.agentId,
        threadId: props.threadId,
        message,
      }),
      inputValue: '',
      onInputChange: vi.fn(),
      messages: [],
      isRunning: false,
    });
  });
  Object.assign(Chat, { View });

  return {
    UseAgentUpdate: { OnRunStatusChanged: 'OnRunStatusChanged' },
    useAgent: () => ({ agent: { isRunning: false }, isReady: true }),
    CopilotKitProvider: ({ children, ...props }: { children: unknown }) => {
      providerProps(props);
      return children;
    },
    CopilotChat: Chat,
  };
});

function renderPanel() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <AgentInteractionProvider>
        <AgentInteractionPanel defaultOpen />
      </AgentInteractionProvider>
    </QueryClientProvider>,
  );
}

describe('AgentInteractionSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInteractionStore();
    vi.mocked(apiClient.getParsed).mockResolvedValue(bootstrap);
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  it('opens a responsive dialog and performs no control write before send', async () => {
    renderPanel();

    const dialog = await screen.findByRole('dialog', { name: 'AgentOS 대화' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute('data-narrow-mode', 'fullscreen');
    expect(dialog.className).toContain('sm:max-w-xl');
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/agent-os/interaction/bootstrap',
      expect.anything(),
    );
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(providerProps).toHaveBeenCalledWith(expect.objectContaining({
      runtimeUrl: '/api/copilotkit',
      credentials: 'include',
    }));
    expect(providerProps.mock.calls[0][0]).not.toHaveProperty('publicApiKey');
    expect(providerProps.mock.calls[0][0]).not.toHaveProperty('publicLicenseKey');
  });

  it('creates no session on new conversation and sends the first turn through public CopilotChat', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: '새 대화' }));
    expect(apiClient.post).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: '메시지' }), '오늘 재고 위험은?');
    await user.click(screen.getByRole('button', { name: '전송' }));

    expect(copilotRun).toHaveBeenCalledWith({
      agentId: 'operator',
      threadId: '11111111-1111-4111-8111-111111111111',
      message: '오늘 재고 위험은?',
    });
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: '에이전트' })).toBeDisabled();
  });

  it('connects a selected existing session through the public component contract only', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: '세션 session-1 열기' }));

    await waitFor(() => expect(copilotConnect).toHaveBeenCalledWith({
      agentId: 'operator',
      threadId: existingSession.copilotThreadId,
    }));
    expect(screen.getByRole('link', { name: 'AgentOS 워크스페이스' })).toHaveAttribute(
      'href',
      '/agent-os',
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('delegates replay/live message ownership to CopilotKit without a parallel transcript', async () => {
    renderPanel();
    await screen.findByRole('dialog', { name: 'AgentOS 대화' });

    expect(screen.queryByTestId('kiditem-message-list')).not.toBeInTheDocument();
    expect(apiClient.getParsed).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('performs no control writes when the surface is unmounted and reloaded', async () => {
    const first = renderPanel();
    await screen.findByRole('dialog', { name: 'AgentOS 대화' });
    first.unmount();
    resetInteractionStore();

    renderPanel();
    await screen.findByRole('dialog', { name: 'AgentOS 대화' });

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps the same session selected when the public chat reports an error', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: '세션 session-1 열기' }));

    act(() => chatError.handler?.({
      error: new Error('run failed'),
      code: 'AGENT_RUN_FAILED',
      context: { agentId: 'operator' },
    }));

    expect(screen.getByText('session-1')).toBeVisible();
    expect(screen.getByText('run failed')).toBeVisible();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
