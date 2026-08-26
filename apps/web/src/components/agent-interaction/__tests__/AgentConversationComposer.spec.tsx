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
    activeTurnId: null,
    onStart: vi.fn(async () => undefined),
    onInput: vi.fn(async () => undefined),
    onInterrupt: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('AgentConversationComposer', () => {
  it('freezes selector controls while a launch is pending before a turn id arrives', async () => {
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

    expect(screen.getByLabelText('대화 엔진')).toBeDisabled();
    expect(screen.getByLabelText('모델')).toBeDisabled();
    expect(screen.getByLabelText('사고 수준')).toBeDisabled();

    await act(async () => launch.resolve());
  });

  it('enables interruption when a turn id arrives before its launch promise settles', async () => {
    const launch = deferred();
    const onStart = vi.fn(() => launch.promise);
    const onInterrupt = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ onInterrupt, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    view.rerender(<AgentConversationComposer {...composerProps({ activeTurnId: 'turn-1', onInterrupt, onStart })} />);

    const interrupt = screen.getByRole('button', { name: '대화 중단' });
    expect(interrupt).toBeEnabled();
    await user.click(interrupt);
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    await act(async () => launch.resolve());
  });

  it('sends a follow-up after a turn id arrives before its launch promise settles', async () => {
    const launch = deferred();
    const onInput = vi.fn(async () => undefined);
    const onStart = vi.fn(() => launch.promise);
    const user = userEvent.setup();
    const view = render(<AgentConversationComposer {...composerProps({ onInput, onStart })} />);

    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    view.rerender(<AgentConversationComposer {...composerProps({ activeTurnId: 'turn-1', onInput, onStart })} />);

    const message = screen.getByLabelText('일반 메시지');
    expect(message).toHaveValue('');
    await user.type(message, 'Follow up with the supplier.');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onInput).toHaveBeenCalledWith('Follow up with the supplier.'));
    expect(onStart).toHaveBeenCalledTimes(1);

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
