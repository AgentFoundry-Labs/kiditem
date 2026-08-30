import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationHistorySettings } from '../ConversationHistorySettings';
import type { ConversationSummary } from '../conversation-api';

const conversations = [{
  id: 'conversation-1', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const,
  title: 'Supplier research', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:01:00.000Z',
}, {
  id: 'conversation-2', runtime: 'claude_cli' as const, agentKey: null,
  title: 'General plan', createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:02:00.000Z',
}];

function DeletingHistoryHarness({ initialConversations = conversations }: { initialConversations?: ConversationSummary[] }) {
  const [history, setHistory] = useState(initialConversations);
  return (
    <ConversationHistorySettings
      conversations={history}
      activeConversationId={null}
      isRunning={false}
      onRename={async () => history[0] ?? conversations[0]}
      onDelete={async (conversationId) => {
        setHistory((current) => current.filter((conversation) => conversation.id !== conversationId));
      }}
    />
  );
}

describe('ConversationHistorySettings', () => {
  it('moves keyboard focus from a row menu into its rename input', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockResolvedValue(conversations[1])}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    expect(screen.getByRole('menuitem', { name: '이름 변경' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('General plan 이름')).toHaveFocus();
  });

  it('returns focus to the invoking row menu after cancelling a rename', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockResolvedValue(conversations[1])}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('returns focus to the invoking row menu after saving a rename', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue({ ...conversations[1], title: 'Updated plan' });
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={onRename}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.keyboard('{Enter}');
    const renameInput = screen.getByLabelText('General plan 이름');
    await user.clear(renameInput);
    await user.type(renameInput, 'Updated plan');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('conversation-2', 'Updated plan'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('returns focus to the invoking row menu after a rename failure', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockRejectedValue(new Error('provider unavailable'))}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.keyboard('{Enter}');
    const renameInput = screen.getByLabelText('General plan 이름');
    await user.clear(renameInput);
    await user.type(renameInput, 'Updated plan');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('대화 이름을 변경할 수 없습니다.'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('moves keyboard focus from a row menu into its delete confirmation', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockResolvedValue(conversations[1])}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: '삭제' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: '삭제 확인' })).toHaveFocus();
  });

  it('returns focus to the invoking row menu after cancelling a deletion', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockResolvedValue(conversations[1])}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('returns focus to the invoking row menu after a deletion failure', async () => {
    const user = userEvent.setup();
    render(
      <ConversationHistorySettings
        conversations={conversations}
        activeConversationId={null}
        isRunning={false}
        onRename={vi.fn().mockResolvedValue(conversations[1])}
        onDelete={vi.fn().mockRejectedValue(new Error('provider unavailable'))}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('0개 대화를 삭제했고 1개는 삭제할 수 없습니다.'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'General plan 메뉴' })).toHaveFocus());
  });

  it('moves focus to the nearest surviving row after a successful deletion', async () => {
    const user = userEvent.setup();
    render(<DeletingHistoryHarness />);

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'General plan 메뉴' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Supplier research 메뉴' })).toHaveFocus());
  });

  it('falls back to the history list when a successful deletion leaves no rows', async () => {
    const user = userEvent.setup();
    render(<DeletingHistoryHarness initialConversations={[conversations[1]]} />);

    await user.click(screen.getByRole('button', { name: 'General plan 메뉴' }));
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'General plan 메뉴' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('list', { name: '대화 기록 목록' })).toHaveFocus());
  });
});
