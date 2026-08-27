import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationCombinedSelector } from '../ConversationCombinedSelector';

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

function selectorProps(overrides: Partial<React.ComponentProps<typeof ConversationCombinedSelector>> = {}) {
  return {
    runtime: 'codex_cli' as const,
    readiness,
    model: 'gpt-5.6',
    reasoningEffort: 'low',
    providerEditable: false,
    disabled: false,
    onRuntimeChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    ...overrides,
  };
}

describe('ConversationCombinedSelector', () => {
  it('uses one compact summary pill and progressive option lists instead of a native three-select form', async () => {
    const user = userEvent.setup();
    render(<ConversationCombinedSelector {...selectorProps()} />);

    const trigger = screen.getByRole('button', { name: '대화 엔진 설정' });
    expect(trigger).toHaveClass('rounded-full', 'border-input', 'bg-card');
    expect(trigger).toHaveTextContent('Codex · gpt-5.6 · low');
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: '대화 엔진 설정' })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대화 엔진' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '모델' })).toHaveTextContent('gpt-5.6');
    expect(screen.getByRole('button', { name: '추론 수준' })).toHaveTextContent('low');

    await user.click(screen.getByRole('button', { name: '모델' }));
    expect(screen.getByRole('listbox', { name: '모델 목록' })).toBeVisible();
    expect(screen.getByRole('button', { name: '대화 엔진 설정으로 돌아가기' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'gpt-5.6' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'gpt-5.6' }));

    expect(screen.getByRole('button', { name: '모델' })).toHaveTextContent('gpt-5.6');
  });

  it('lets a draft choose its provider through the same progressive menu and restores focus on Escape', async () => {
    const user = userEvent.setup();
    const props = selectorProps({ runtime: null, model: null, reasoningEffort: null, providerEditable: true });
    render(<ConversationCombinedSelector {...props} />);

    const trigger = screen.getByRole('button', { name: '대화 엔진 설정' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '대화 엔진' }));
    expect(screen.getByRole('listbox', { name: '대화 엔진 목록' })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Codex' }));
    expect(props.onRuntimeChange).toHaveBeenCalledWith('codex_cli');
    expect(props.onModelChange).toHaveBeenCalledWith(null);
    expect(props.onReasoningEffortChange).toHaveBeenCalledWith(null);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '대화 엔진 설정' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('moves focus to the first actionable control when it opens and after changing or backing out of a step', async () => {
    const user = userEvent.setup();
    render(<ConversationCombinedSelector {...selectorProps({
      runtime: null,
      model: null,
      reasoningEffort: null,
      providerEditable: true,
    })} />);

    await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));
    const runtime = screen.getByRole('button', { name: '대화 엔진' });
    expect(runtime).toHaveFocus();

    await user.click(runtime);
    const back = screen.getByRole('button', { name: '대화 엔진 설정으로 돌아가기' });
    expect(back).toHaveFocus();

    await user.click(back);
    expect(screen.getByRole('button', { name: '대화 엔진' })).toHaveFocus();
  });

  it('uses the product term 추론 수준 for an unsupported stored pair', async () => {
    const user = userEvent.setup();
    render(<ConversationCombinedSelector {...selectorProps({
      model: 'retired-model',
      reasoningEffort: 'retired-effort',
      needsReview: true,
    })} />);

    await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));

    expect(screen.getByRole('alert')).toHaveTextContent('선택한 모델과 추론 수준을 다시 선택해 주세요.');
    const retiredReasoningLabel = ['사', '고 수준'].join('');
    expect(screen.queryByText(new RegExp(retiredReasoningLabel))).not.toBeInTheDocument();
  });
});
