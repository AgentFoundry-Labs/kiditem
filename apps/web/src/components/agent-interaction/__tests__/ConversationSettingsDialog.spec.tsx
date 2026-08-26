import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationSettingsDialog } from '../ConversationSettingsDialog';

const readiness = [{
  runtime: 'codex_cli' as const,
  ready: true as const,
  readiness: {
    runtime: 'codex_cli' as const,
    version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low'],
    modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low'] }],
    loginVerified: true as const, mcpProtocolRevision: '2026-07-28',
  },
}, {
  runtime: 'claude_cli' as const,
  ready: true as const,
  readiness: {
    runtime: 'claude_cli' as const,
    version: '1.0.0', models: ['claude-opus'], reasoningEfforts: ['high'],
    modelReasoningEfforts: [{ model: 'claude-opus', reasoningEfforts: ['high'] }],
    loginVerified: true as const, mcpProtocolRevision: '2026-07-28',
  },
}];

const conversations = [{
  id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const,
  title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:01:00.000Z',
}, {
  id: 'conversation-2', runtime: 'claude_cli' as const, agentKey: null,
  title: 'General plan', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:02:00.000Z',
}];

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>설정 열기</button>
      <ConversationSettingsDialog
        open={open}
        onClose={() => {
          setOpen(false);
          window.setTimeout(() => triggerRef.current?.focus(), 0);
        }}
        conversations={conversations}
        activeConversationId={null}
        activeTurnId={null}
        preferences={{ schemaVersion: 1, contexts: {} }}
        preferencesLoading={false}
        preferencesError={false}
        readiness={readiness}
        onSavePreference={vi.fn().mockResolvedValue({ schemaVersion: 1, contexts: {} })}
        onRenameConversation={vi.fn().mockResolvedValue(conversations[0])}
        onDeleteConversation={vi.fn().mockResolvedValue(undefined)}
      />
    </>
  );
}

describe('ConversationSettingsDialog', () => {
  it('uses one focus-returning dialog with all six contexts and both engines', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '설정 열기' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '대화 설정' });
    expect(within(dialog).getByRole('tab', { name: '대화 기본값' })).toBeVisible();
    expect(within(dialog).getByLabelText('대화 컨텍스트')).toHaveTextContent('일반 AI 챗');
    expect(within(dialog).getByLabelText('대화 컨텍스트')).toHaveTextContent('광고 Agent');
    expect(within(dialog).getByLabelText('대화 엔진')).toHaveTextContent('Codex');
    expect(within(dialog).getByLabelText('대화 엔진')).toHaveTextContent('Claude');
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('filters history case-insensitively by an exact folder and keeps the live conversation undeletable', async () => {
    const user = userEvent.setup();
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId="conversation-1"
      activeTurnId="turn-1"
      preferences={{ schemaVersion: 1, contexts: {} }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={readiness}
      onSavePreference={vi.fn()}
      onRenameConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />);

    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    expect(within(screen.getByRole('list', { name: '대화 기록 목록' })).getAllByRole('listitem')[0]).toHaveTextContent('General plan');
    await user.type(screen.getByLabelText('대화 검색'), 'GENERAL');
    expect(screen.getByText('General plan')).toBeVisible();
    expect(screen.queryByText('Supplier research')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('대화 검색'));
    await user.selectOptions(screen.getByLabelText('대화 폴더'), 'sourcing');
    expect(screen.getByText('Supplier research')).toBeVisible();
    expect(screen.queryByText('General plan')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supplier research 삭제' })).toBeDisabled();
  });

  it('keeps an obsolete saved pair visibly review-needed and confirms the exact folder deletion scope', async () => {
    const user = userEvent.setup();
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId={null}
      activeTurnId={null}
      preferences={{
        schemaVersion: 1,
        contexts: { general: { codex_cli: { model: 'retired-model', reasoningEffort: 'max' } } },
      }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={readiness}
      onSavePreference={vi.fn()}
      onRenameConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />);

    expect(screen.getByLabelText('기본 모델')).toHaveValue('retired-model');
    expect(screen.getByText('저장된 모델과 사고 수준을 다시 선택해 주세요.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    await user.selectOptions(screen.getByLabelText('대화 폴더'), 'sourcing');
    await user.click(screen.getByRole('button', { name: '선택 폴더 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '대화 삭제 확인' })).toHaveTextContent('소싱 Agent 폴더의 대화 1개');
  });

  it('preserves the previous title when a provider rename fails', async () => {
    const user = userEvent.setup();
    const onRenameConversation = vi.fn().mockRejectedValue(new Error('provider failed'));
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId={null}
      activeTurnId={null}
      preferences={{ schemaVersion: 1, contexts: {} }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={readiness}
      onSavePreference={vi.fn()}
      onRenameConversation={onRenameConversation}
      onDeleteConversation={vi.fn()}
    />);

    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    await user.click(screen.getByRole('button', { name: 'General plan 이름 변경' }));
    await user.clear(screen.getByLabelText('General plan 이름'));
    await user.type(screen.getByLabelText('General plan 이름'), 'Changed title');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));

    expect(onRenameConversation).toHaveBeenCalledWith('conversation-2', 'Changed title');
    expect(screen.getByLabelText('General plan 이름')).toHaveValue('General plan');
    expect(screen.getByText('대화 이름을 변경할 수 없습니다.')).toBeVisible();
  });
});
