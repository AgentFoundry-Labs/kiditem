import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConversationCombinedSelector } from '../ConversationCombinedSelector';

const readiness = [
  {
    runtime: 'codex_cli' as const,
    ready: true as const,
    readiness: {
      runtime: 'codex_cli' as const,
      version: '0.149.1',
      models: ['gpt-5.6', 'gpt-5.6-mini'],
      reasoningEfforts: ['low', 'high'],
      modelReasoningEfforts: [
        { model: 'gpt-5.6', reasoningEfforts: ['low'] },
        { model: 'gpt-5.6-mini', reasoningEfforts: ['high'] },
      ],
      loginVerified: true as const,
      mcpProtocolRevision: '2026-07-28' as const,
    },
  },
  { runtime: 'claude_cli' as const, ready: false as const, code: 'selected_engine_unavailable' },
];

function SelectorHarness({ providerEditable = true, activeTurn = false }: {
  providerEditable?: boolean;
  activeTurn?: boolean;
}) {
  const [runtime, setRuntime] = useState<'codex_cli' | 'claude_cli' | null>('codex_cli');
  const [model, setModel] = useState<string | null>('gpt-5.6');
  const [reasoningEffort, setReasoningEffort] = useState<string | null>('low');
  return (
    <ConversationCombinedSelector
      runtime={runtime}
      readiness={readiness}
      model={model}
      reasoningEffort={reasoningEffort}
      providerEditable={providerEditable}
      disabled={activeTurn}
      onRuntimeChange={setRuntime}
      onModelChange={setModel}
      onReasoningEffortChange={setReasoningEffort}
    />
  );
}

describe('ConversationCombinedSelector', () => {
  it('keeps provider, model, and reasoning choices in one selector and validates a model-effort pair', async () => {
    const user = userEvent.setup();
    render(<SelectorHarness />);

    const trigger = screen.getByRole('button', { name: '대화 엔진 설정' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '대화 엔진 설정' })).toBeVisible();
    expect(screen.getByLabelText('대화 엔진')).toHaveValue('codex_cli');
    expect(screen.getByLabelText('모델')).toHaveValue('gpt-5.6');
    expect(screen.getByLabelText('사고 수준')).toHaveValue('low');

    await user.selectOptions(screen.getByLabelText('모델'), 'gpt-5.6-mini');
    expect(screen.getByLabelText('사고 수준')).toHaveValue('');
    expect(screen.getByLabelText('사고 수준')).toHaveTextContent('high');
    await user.selectOptions(screen.getByLabelText('사고 수준'), 'high');
    expect(trigger).toHaveTextContent('Codex · gpt-5.6-mini · high');
  });

  it('allows the engine only before creation while preserving model and reasoning changes at a terminal boundary', async () => {
    const user = userEvent.setup();
    render(<SelectorHarness providerEditable={false} />);

    await user.click(screen.getByRole('button', { name: '대화 엔진 설정' }));
    expect(screen.getByLabelText('대화 엔진')).toBeDisabled();
    expect(screen.getByLabelText('모델')).toBeEnabled();
    expect(screen.getByLabelText('사고 수준')).toBeEnabled();
  });

  it('closes with Escape and keeps every selector control disabled during a live turn', async () => {
    const user = userEvent.setup();
    render(<SelectorHarness activeTurn />);

    const trigger = screen.getByRole('button', { name: '대화 엔진 설정' });
    await user.click(trigger);
    expect(screen.getByLabelText('대화 엔진')).toBeDisabled();
    expect(screen.getByLabelText('모델')).toBeDisabled();
    expect(screen.getByLabelText('사고 수준')).toBeDisabled();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '대화 엔진 설정' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
