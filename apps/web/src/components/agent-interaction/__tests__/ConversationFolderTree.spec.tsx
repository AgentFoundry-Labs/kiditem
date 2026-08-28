import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationFolderTree } from '../ConversationFolderTree';
import type { ConversationSummary } from '../conversation-api';

const conversations = [
  {
    id: 'source-older', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const, title: 'Earlier sourcing',
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
  },
  {
    id: 'source-newer', runtime: 'codex_cli' as const, agentKey: 'sourcing' as const, title: 'Latest sourcing',
    createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  },
  {
    id: 'general', runtime: 'claude_cli' as const, agentKey: null, title: 'General question',
    createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  },
  {
    id: 'ads', runtime: 'codex_cli' as const, agentKey: 'advertising' as const, title: 'Campaign check',
    createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  },
];

function renderTree(overrides: Partial<ComponentProps<typeof ConversationFolderTree>> = {}) {
  const props = {
    conversations,
    selectedContext: null,
    activeConversationId: 'source-newer',
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  return { ...render(<ConversationFolderTree {...props} />), props };
}

function DeleteFocusHarness({ initialConversations }: { initialConversations: ConversationSummary[] }) {
  const [items, setItems] = useState(initialConversations);
  return (
    <ConversationFolderTree
      conversations={items}
      selectedContext={items[0]?.agentKey ?? null}
      activeConversationId={items[0]?.id ?? null}
      onSelectConversation={vi.fn()}
      onNewConversation={vi.fn()}
      onOpenSettings={vi.fn()}
      onDeleteConversation={async (conversationId) => {
        setItems((current) => current.filter((conversation) => conversation.id !== conversationId));
      }}
    />
  );
}

describe('ConversationFolderTree', () => {
  it('keeps General conversations only in 채팅 and the exact five Agent folders in 에이전트', async () => {
    const user = userEvent.setup();
    renderTree();

    const tree = screen.getByRole('navigation', { name: '대화 목록' });
    const labels = ['소싱 Agent', '상품 Agent', '공급 Agent', '채널 운영 Agent', '광고 Agent'];
    expect(within(tree).getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter((label): label is string => labels.includes(label ?? ''))).toEqual([
      '소싱 Agent',
      '상품 Agent',
      '공급 Agent',
      '채널 운영 Agent',
      '광고 Agent',
    ]);

    const sourcing = within(tree).getByRole('button', { name: '소싱 Agent' });
    const merchandising = within(tree).getByRole('button', { name: '상품 Agent' });
    expect(within(tree).getByText('채팅')).toHaveClass('text-xs');
    expect(within(tree).getByText('에이전트')).toHaveClass('text-xs');
    expect(
      within(tree).getByText('에이전트').compareDocumentPosition(within(tree).getByText('채팅'))
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(within(tree).getByRole('button', { name: 'General question' })).toBeInTheDocument();
    expect(within(tree).queryByRole('button', { name: '일반 AI 챗' })).not.toBeInTheDocument();
    expect(sourcing).toHaveAttribute('aria-expanded', 'true');
    expect(merchandising).toHaveAttribute('aria-expanded', 'false');

    await user.click(merchandising);
    expect(merchandising).toHaveAttribute('aria-expanded', 'true');

    const sourcingRows = within(screen.getByRole('group', { name: '소싱 Agent 대화' }));
    expect(sourcingRows.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Latest sourcing',
      'Earlier sourcing',
    ]);
    expect(sourcingRows.getByRole('button', { name: 'Latest sourcing' })).toHaveAttribute('aria-current', 'page');
    expect(sourcingRows.getByRole('button', { name: 'Latest sourcing' })).toHaveClass(
      'bg-primary-soft',
      'font-semibold',
      'text-primary',
    );
    expect(sourcingRows.queryByText('Campaign check')).not.toBeInTheDocument();
  });

  it('opens only a browser draft for the exact folder context', async () => {
    const user = userEvent.setup();
    const { props } = renderTree();

    await user.click(screen.getByRole('button', { name: '소싱 Agent 새 AI 대화' }));

    expect(props.onNewConversation).toHaveBeenCalledWith('sourcing');
  });

  it('expands the selected conversation folder and marks only that conversation current', () => {
    renderTree({ selectedContext: 'advertising', activeConversationId: 'ads' });

    expect(screen.getByRole('button', { name: '광고 Agent' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Campaign check' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps rename and delete behind an accessible local overflow menu, fencing the live row', async () => {
    const user = userEvent.setup();
    const onRenameConversation = vi.fn().mockResolvedValue({ ...conversations[1], title: 'Renamed sourcing' });
    const onDeleteConversation = vi.fn().mockResolvedValue(undefined);
    renderTree({ onRenameConversation, onDeleteConversation, isRunning: true });

    const tree = screen.getByRole('navigation', { name: '대화 목록' });
    expect(tree).toHaveClass('w-full');
    expect(within(tree).queryByText('KidItem')).not.toBeInTheDocument();
    expect(within(tree).queryByRole('link', { name: '대시보드로 돌아가기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Earlier sourcing 이름 변경' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Earlier sourcing 삭제' })).not.toBeInTheDocument();

    const latestMenu = screen.getByRole('button', { name: 'Latest sourcing 메뉴' });
    await user.click(latestMenu);
    expect(screen.getByRole('menu', { name: 'Latest sourcing 메뉴' })).toBeVisible();
    expect(within(screen.getByRole('menu', { name: 'Latest sourcing 메뉴' })).getAllByRole('menuitem')
      .map((item) => item.textContent?.trim())).toEqual(['이름 변경', '삭제']);
    expect(screen.getByRole('menuitem', { name: '삭제' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(latestMenu).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    const rename = screen.getByRole('menuitem', { name: '이름 변경' });
    expect(rename).toHaveFocus();
    await user.click(rename);
    const renameInput = screen.getByLabelText('Earlier sourcing 이름');
    expect(renameInput).toHaveFocus();
    await user.clear(renameInput);
    await user.type(renameInput, 'Renamed sourcing');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));
    expect(onRenameConversation).toHaveBeenCalledWith('source-older', 'Renamed sourcing');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '이름 변경' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    const deleteMenuItem = screen.getByRole('menuitem', { name: '삭제' });
    expect(screen.getByRole('menuitem', { name: '이름 변경' })).toHaveFocus();
    await user.click(deleteMenuItem);
    expect(screen.getByRole('alertdialog', { name: '대화 삭제 확인' })).toHaveTextContent('Earlier sourcing 대화를 삭제할까요?');
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    const confirmDelete = screen.getByRole('button', { name: '삭제 확인' });
    expect(confirmDelete).toHaveFocus();
    await user.click(confirmDelete);
    expect(onDeleteConversation).toHaveBeenCalledWith('source-older');
  });

  it('moves focus to the nearest surviving row after a successful deletion', async () => {
    const user = userEvent.setup();
    render(<DeleteFocusHarness initialConversations={conversations} />);

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Earlier sourcing' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Latest sourcing' })).toHaveFocus();
  });

  it('falls back to the owning folder or General section when deletion leaves no rows', async () => {
    const user = userEvent.setup();
    const view = render(<DeleteFocusHarness initialConversations={[conversations[0]]} />);

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '소싱 Agent' })).toHaveFocus());

    view.unmount();
    render(<DeleteFocusHarness initialConversations={[conversations[2]]} />);
    await user.click(screen.getByRole('button', { name: 'General question 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '채팅' })).toHaveFocus());
  });

  it('uses a quiet position-led new-chat action, quiet purple selection, and distinct context marks', () => {
    const view = renderTree();

    const newConversation = screen.getByRole('button', { name: '새 AI 대화' });
    expect(newConversation).not.toHaveClass('bg-primary', 'text-primary-foreground');
    expect(newConversation).toHaveClass('justify-start');
    view.unmount();
    renderTree({ selectedContext: 'sourcing' });
    expect(screen.getByRole('button', { name: '소싱 Agent' })).toHaveClass('bg-primary-soft', 'text-primary');
    expect(screen.getByTestId('conversation-context-mark-sourcing')).toHaveClass('bg-primary-soft', 'text-primary');
    expect(screen.getByTestId('conversation-context-mark-advertising')).toHaveClass('bg-rose-100', 'text-rose-700');
  });
});
