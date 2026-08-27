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
        isRunning={false}
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

function PartialFailureHarness({
  onDeleteConversation,
}: {
  onDeleteConversation(conversationId: string): Promise<void>;
}) {
  const [history, setHistory] = useState(conversations);
  const deleteConversation = async (conversationId: string) => {
    await onDeleteConversation(conversationId);
    setHistory((current) => current.filter((conversation) => conversation.id !== conversationId));
  };

  return (
    <ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={history}
      activeConversationId={null}
      isRunning={false}
      preferences={{ schemaVersion: 1, contexts: {} }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={readiness}
      onSavePreference={vi.fn().mockResolvedValue({ schemaVersion: 1, contexts: {} })}
      onRenameConversation={vi.fn().mockResolvedValue(conversations[0])}
      onDeleteConversation={deleteConversation}
    />
  );
}

describe('ConversationSettingsDialog', () => {
  it('uses one centered responsive dialog with local settings navigation and focus return', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '설정 열기' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '대화 설정' });
    expect(dialog).toHaveClass('max-w-[760px]', 'sm:grid-cols-[160px_minmax(0,1fr)]');
    const navigation = within(dialog).getByRole('navigation', { name: '대화 설정' });
    expect(navigation).toHaveClass('sm:border-r');
    expect(within(navigation).getAllByRole('tab')).toHaveLength(2);
    expect(within(navigation).getByRole('tab', { name: '대화 기본값' })).toBeVisible();
    expect(within(dialog).getByLabelText('대화 컨텍스트')).toHaveTextContent('일반 AI 챗');
    expect(within(dialog).getByLabelText('대화 컨텍스트')).toHaveTextContent('광고 Agent');
    expect(within(dialog).getByLabelText('대화 엔진')).toHaveTextContent('Codex');
    expect(within(dialog).getByLabelText('대화 엔진')).toHaveTextContent('Claude');
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape or an outside interaction and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '설정 열기' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대화 설정' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0.z-40');
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대화 설정' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('filters history case-insensitively by an exact folder and keeps the live conversation undeletable', async () => {
    const user = userEvent.setup();
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId="conversation-1"
      isRunning
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
    expect(screen.queryByRole('button', { name: 'General plan 이름 변경' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'General plan 삭제' })).not.toBeInTheDocument();
    const generalMenu = screen.getByRole('button', { name: 'General plan 메뉴' });
    await user.click(generalMenu);
    expect(screen.getByRole('menu', { name: 'General plan 메뉴' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '이름 변경' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(generalMenu).toHaveFocus();
    expect(screen.queryByRole('menu', { name: 'General plan 메뉴' })).not.toBeInTheDocument();
    await user.click(generalMenu);
    fireEvent.pointerDown(screen.getByLabelText('대화 검색'));
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'General plan 메뉴' })).not.toBeInTheDocument());
    expect(generalMenu).toHaveFocus();
    await user.type(screen.getByLabelText('대화 검색'), 'GENERAL');
    expect(screen.getByText('General plan')).toBeVisible();
    expect(screen.queryByText('Supplier research')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('대화 검색'));
    await user.selectOptions(screen.getByLabelText('대화 폴더'), 'sourcing');
    expect(screen.getByText('Supplier research')).toBeVisible();
    expect(screen.queryByText('General plan')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Supplier research 메뉴' }));
    expect(screen.getByRole('menuitem', { name: '삭제' })).toBeDisabled();
  });

  it('keeps an obsolete saved pair visibly review-needed and confirms the exact folder deletion scope', async () => {
    const user = userEvent.setup();
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId={null}
      isRunning={false}
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
    expect(screen.getByText('저장된 모델과 추론 수준을 다시 선택해 주세요.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    await user.selectOptions(screen.getByLabelText('대화 폴더'), 'sourcing');
    await user.click(screen.getByRole('button', { name: '선택 폴더 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '대화 삭제 확인' })).toHaveTextContent('소싱 Agent 폴더의 대화 1개');
  });

  it('does not flag a saved pair for review until readiness can establish that it is unsupported', () => {
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId={null}
      isRunning={false}
      preferences={{
        schemaVersion: 1,
        contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' } } },
      }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={undefined}
      onSavePreference={vi.fn()}
      onRenameConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />);

    expect(screen.queryByText('저장된 모델과 추론 수준을 다시 선택해 주세요.')).not.toBeInTheDocument();
  });

  it('preserves the previous title and returns focus to its menu when a provider rename fails', async () => {
    const user = userEvent.setup();
    const onRenameConversation = vi.fn().mockRejectedValue(new Error('provider failed'));
    render(<ConversationSettingsDialog
      open
      onClose={vi.fn()}
      conversations={conversations}
      activeConversationId={null}
      isRunning={false}
      preferences={{ schemaVersion: 1, contexts: {} }}
      preferencesLoading={false}
      preferencesError={false}
      readiness={readiness}
      onSavePreference={vi.fn()}
      onRenameConversation={onRenameConversation}
      onDeleteConversation={vi.fn()}
    />);

    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '이름 변경' }));
    await user.clear(screen.getByLabelText('General plan 이름'));
    await user.type(screen.getByLabelText('General plan 이름'), 'Changed title');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));

    expect(onRenameConversation).toHaveBeenCalledWith('conversation-2', 'Changed title');
    expect(screen.getByText('General plan')).toBeVisible();
    expect(screen.getByText('대화 이름을 변경할 수 없습니다.')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('keeps provider-failed bulk rows retryable and reports the exact partial count', async () => {
    const user = userEvent.setup();
    let supplierDeleteAttempts = 0;
    const onDeleteConversation = vi.fn(async (conversationId: string) => {
      if (conversationId !== 'conversation-1') return;
      supplierDeleteAttempts += 1;
      if (supplierDeleteAttempts === 1) throw new Error('provider unavailable');
    });
    render(<PartialFailureHarness onDeleteConversation={onDeleteConversation} />);

    await user.click(screen.getByRole('tab', { name: '채팅 기록' }));
    await user.click(screen.getByRole('button', { name: '전체 대화 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '대화 삭제 확인' })).toHaveTextContent('전체 대화의 대화 2개');
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('1개 대화를 삭제했고 1개는 삭제할 수 없습니다.'));
    expect(screen.getByText('Supplier research')).toBeVisible();
    expect(screen.queryByText('General plan')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supplier research 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));
    await waitFor(() => expect(screen.queryByText('Supplier research')).not.toBeInTheDocument());
    expect(onDeleteConversation).toHaveBeenCalledTimes(3);
  });
});
