import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationPanel } from '../ConversationPanel';

const pushMock = vi.hoisted(() => vi.fn());
const openConversationMock = vi.hoisted(() => vi.fn());
const openSettingsMock = vi.hoisted(() => vi.fn());
const runtimeMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../ConversationRuntimeHost', () => ({
  useConversationRuntime: () => runtimeMock(),
}));

vi.mock('../ConversationFlow', () => ({
  ConversationFlow: () => <div data-testid="conversation-flow" />,
}));

vi.mock('../conversation-surface-state', () => ({
  openConversation: openConversationMock,
  useConversationSurfaceState: (selector: (state: { openSettings(): void }) => unknown) =>
    selector({ openSettings: openSettingsMock }),
}));

function activeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    activeConversation: {
      id: 'conversation-1',
      agentKey: 'sourcing',
      title: '소싱 판단',
      runtime: 'codex_cli',
    },
    draft: null,
    conversationId: 'conversation-1',
    ...overrides,
  };
}

describe('ConversationPanel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    openConversationMock.mockReset();
    openSettingsMock.mockReset();
    runtimeMock.mockReturnValue(activeRuntime());
  });

  it('uses the selected context, shared flow, settings, history navigation, and close action', () => {
    const closeMock = vi.fn();
    render(<ConversationPanel onClose={closeMock} />);

    expect(screen.getByRole('heading', { name: '소싱 Agent' })).toBeInTheDocument();
    expect(screen.getByText('소싱 판단')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-flow')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '대화 설정' }));
    fireEvent.click(screen.getByRole('button', { name: '전체 기록' }));
    fireEvent.click(screen.getByRole('button', { name: 'AI 챗 닫기' }));

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/agent-os');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('starts only General or one of the exact five Agent drafts from its new-conversation menu', () => {
    render(<ConversationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '새 AI 대화' }));

    expect(screen.getAllByRole('menuitem')).toHaveLength(6);
    expect(screen.getByRole('menuitem', { name: '일반 AI 챗' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '소싱 Agent' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '상품 Agent' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '공급 Agent' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '채널 운영 Agent' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '광고 Agent' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '광고 Agent' }));

    expect(openConversationMock).toHaveBeenCalledWith({ fixedAgentKey: 'advertising' });
  });

  it('closes the new-conversation menu with Escape before the panel-level dismiss action can run', () => {
    const closeMock = vi.fn();
    render(<ConversationPanel onClose={closeMock} />);
    const trigger = screen.getByRole('button', { name: '새 AI 대화' });

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(closeMock).not.toHaveBeenCalled();
  });
});
