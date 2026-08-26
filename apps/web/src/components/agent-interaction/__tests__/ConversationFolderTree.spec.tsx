import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationFolderTree } from '../ConversationFolderTree';

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
    onSelectContext: vi.fn(),
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  return { ...render(<ConversationFolderTree {...props} />), props };
}

describe('ConversationFolderTree', () => {
  it('keeps the exact General and five-Agent order, independent expansion, and only folder-owned conversations', async () => {
    const user = userEvent.setup();
    renderTree();

    const tree = screen.getByRole('navigation', { name: '대화 목록' });
    const labels = ['일반 AI 챗', '소싱 Agent', '상품 Agent', '공급 Agent', '채널 운영 Agent', '광고 Agent'];
    expect(within(tree).getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter((label): label is string => labels.includes(label ?? ''))).toEqual([
      '일반 AI 챗',
      '소싱 Agent',
      '상품 Agent',
      '공급 Agent',
      '채널 운영 Agent',
      '광고 Agent',
    ]);

    const general = within(tree).getByRole('button', { name: '일반 AI 챗' });
    const sourcing = within(tree).getByRole('button', { name: '소싱 Agent' });
    const merchandising = within(tree).getByRole('button', { name: '상품 Agent' });
    expect(general).toHaveAttribute('aria-expanded', 'true');
    expect(sourcing).toHaveAttribute('aria-expanded', 'true');
    expect(merchandising).toHaveAttribute('aria-expanded', 'false');

    await user.click(merchandising);
    expect(merchandising).toHaveAttribute('aria-expanded', 'true');
    expect(general).toHaveAttribute('aria-expanded', 'true');

    const sourcingRows = within(screen.getByRole('group', { name: '소싱 Agent 대화' }));
    expect(sourcingRows.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Latest sourcing',
      'Earlier sourcing',
    ]);
    expect(sourcingRows.getByRole('button', { name: 'Latest sourcing' })).toHaveAttribute('aria-current', 'page');
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

  it('keeps provider-first rename and delete actions on conversation rows, fencing the live row', async () => {
    const user = userEvent.setup();
    const onRenameConversation = vi.fn().mockResolvedValue({ ...conversations[1], title: 'Renamed sourcing' });
    const onDeleteConversation = vi.fn().mockResolvedValue(undefined);
    renderTree({ onRenameConversation, onDeleteConversation, activeTurnId: 'turn-1' });

    expect(screen.getByRole('button', { name: 'Latest sourcing 삭제' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 이름 변경' }));
    await user.clear(screen.getByLabelText('Earlier sourcing 이름'));
    await user.type(screen.getByLabelText('Earlier sourcing 이름'), 'Renamed sourcing');
    await user.click(screen.getByRole('button', { name: '이름 저장' }));
    expect(onRenameConversation).toHaveBeenCalledWith('source-older', 'Renamed sourcing');

    await user.click(screen.getByRole('button', { name: 'Earlier sourcing 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '대화 삭제 확인' })).toHaveTextContent('Earlier sourcing 대화를 삭제할까요?');
    await user.click(screen.getByRole('button', { name: '삭제 확인' }));
    expect(onDeleteConversation).toHaveBeenCalledWith('source-older');
  });
});
