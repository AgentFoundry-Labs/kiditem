import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentConversationComposer } from '../AgentConversationComposer';

const readiness = [{
  runtime: 'codex_cli' as const,
  ready: true as const,
  readiness: {
    runtime: 'codex_cli' as const,
    version: '0.149.1',
    models: ['gpt-5.6'],
    reasoningEfforts: ['low'],
    modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
    loginVerified: true as const,
    mcpProtocolRevision: '2026-07-28',
  },
}];

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function composerProps(overrides: Partial<React.ComponentProps<typeof AgentConversationComposer>> = {}) {
  return {
    conversationId: 'conversation-1',
    contextLabel: '일반',
    placeholder: '무엇을 도와드릴까요?',
    runtime: 'codex_cli' as const,
    readiness,
    initialMessage: 'Review the supplier evidence.',
    initialModel: 'gpt-5.6',
    initialReasoningEffort: 'low',
    isDraft: false,
    isRunning: false,
    onStart: vi.fn(async () => undefined),
    onInterrupt: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('AgentConversationComposer', () => {
  it('uses one elevated compact composer with a container-aware two-row narrow layout', () => {
    const { container } = render(<AgentConversationComposer {...composerProps()} />);

    expect(container.querySelector('form')).not.toHaveClass('border-t');
    expect(container.querySelector('form')).toHaveClass('bg-card');
    expect(container.querySelector('form > div')).toHaveClass('conversation-composer-surface', 'max-w-3xl', 'rounded-[28px]', 'border-input', 'bg-card', 'shadow-sm');
    expect(screen.getByLabelText('일반 메시지')).toHaveClass('conversation-composer-input', 'min-h-[52px]');
    expect(container.querySelector('.conversation-composer-layout')).toBeInTheDocument();
    expect(container.querySelector('.conversation-composer-actions')).toHaveClass('min-w-0', 'flex-1');
    const selector = screen.getByRole('button', { name: '대화 엔진 설정' });
    expect(selector.parentElement).toHaveClass('min-w-0', 'flex-1');
    expect(selector).toHaveClass('w-full', 'min-w-0', 'rounded-full', 'border-input', 'bg-card');
    expect(selector.querySelector('span')).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(screen.getByRole('button', { name: '보내기' })).toHaveClass('shrink-0');
  });

  it('clears a stale review warning after the user selects a supported model and effort pair', async () => {
    const user = userEvent.setup();
    render(<AgentConversationComposer {...composerProps({
      needsReview: true,
      initialModel: 'retired-model',
      initialReasoningEffort: 'medium',
    })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('선택한 모델과 추론 수준을 다시 선택해 주세요.');
    await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));
    await user.click(screen.getByRole('button', { name: '모델' }));
    await user.click(screen.getByRole('option', { name: 'gpt-5.6' }));
    await user.click(screen.getByRole('button', { name: '추론 수준' }));
    await user.click(screen.getByRole('option', { name: 'low' }));

    expect(screen.queryByText('선택한 모델과 추론 수준을 다시 선택해 주세요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled();
  });

  it('keeps an untouched missing model and reasoning selection neutral', () => {
    render(<AgentConversationComposer {...composerProps({
      needsReview: true,
      initialModel: null,
      initialReasoningEffort: null,
    })} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('freezes selector controls while a launch is pending before CopilotKit reports a running turn', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const user = userEvent.setup();
    render(<AgentConversationComposer {...composerProps({ isDraft: true, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith({
      message: 'Review the supplier evidence.',
      model: 'gpt-5.6',
      reasoningEffort: 'low',
    }));
    await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));

    expect(screen.getByRole('button', { name: '대화 엔진' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '모델' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '추론 수준' })).toBeDisabled();

    await act(async () => launch.resolve());
  });

  it('enables interruption when CopilotKit reports a running turn before its launch promise settles', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const onInterrupt = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ onInterrupt, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    view.rerender(<AgentConversationComposer {...composerProps({ isRunning: true, onInterrupt, onStart })} />);

    const interrupt = screen.getByRole('button', { name: '대화 중단' });
    expect(interrupt).toBeEnabled();
    await user.click(interrupt);
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    await act(async () => launch.resolve());
  });

  it('does not restore the retained first prompt when the same composer is promoted to a conversation', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ isDraft: true, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('일반 메시지')).toHaveValue('');

    view.rerender(<AgentConversationComposer {...composerProps({
      isDraft: false,
      isRunning: true,
      onStart,
    })} />);

    expect(screen.getByLabelText('일반 메시지')).toHaveValue('');
    await act(async () => launch.resolve());
  });

  it('keeps a failed first prompt and error when promotion commits before the launch rejection flushes', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ isDraft: true, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));

    await act(async () => {
      view.rerender(<AgentConversationComposer {...composerProps({ isDraft: false, onStart })} />);
      launch.reject(new Error('provider unavailable'));
      await Promise.resolve();
    });

    expect(screen.getByLabelText('일반 메시지')).toHaveValue('Review the supplier evidence.');
    expect(screen.getByRole('alert')).toHaveTextContent('선택한 대화 엔진을 현재 사용할 수 없습니다.');
  });

  it('retains a typed follow-up until the live turn becomes terminal', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    view.rerender(<AgentConversationComposer {...composerProps({ isRunning: true, onStart })} />);

    const message = screen.getByLabelText('일반 메시지');
    expect(message).toHaveValue('');
    await user.type(message, 'Follow up with the supplier.');
    await user.keyboard('{Enter}');

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(message).toHaveValue('Follow up with the supplier.');

    await act(async () => launch.resolve());
  });

  it('keeps an existing conversation message while model and effort preferences settle', async () => {
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({
      initialMessage: undefined,
      initialModel: null,
      initialReasoningEffort: null,
      readiness: undefined,
    })} />);
    const message = screen.getByLabelText('일반 메시지');

    await user.type(message, 'Keep this existing-conversation message.');
    view.rerender(<AgentConversationComposer {...composerProps({
      initialMessage: undefined,
      initialModel: 'gpt-5.6',
      initialReasoningEffort: 'low',
    })} />);

    await waitFor(() => expect(message).toHaveValue('Keep this existing-conversation message.'));
  });

  it('keeps an unsaved draft while model and effort preferences settle', async () => {
    const onUpdateDraft = vi.fn();
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({
      isDraft: true,
      initialMessage: 'Saved portion. ',
      initialModel: null,
      initialReasoningEffort: null,
      readiness: undefined,
      onUpdateDraft,
    })} />);
    const message = screen.getByLabelText('일반 메시지');

    await user.type(message, 'Keep this unsaved portion.');
    view.rerender(<AgentConversationComposer {...composerProps({
      isDraft: true,
      initialMessage: 'Saved portion. ',
      initialModel: 'gpt-5.6',
      initialReasoningEffort: 'low',
      onUpdateDraft,
    })} />);

    await waitFor(() => expect(message).toHaveValue('Saved portion. Keep this unsaved portion.'));
  });

  it('restores a draft message after creation fails', async () => {
    const onStart = vi.fn(async () => {
      throw new Error('gateway unavailable');
    });
    const user = userEvent.setup();
    render(<AgentConversationComposer {...composerProps({ isDraft: true, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('일반 메시지')).toHaveValue('Review the supplier evidence.');
  });
});
