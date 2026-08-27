import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationPanel } from '../ConversationPanel';

const openConversationMock = vi.hoisted(() => vi.fn());
const openSettingsMock = vi.hoisted(() => vi.fn());
const runtimeMock = vi.hoisted(() => vi.fn());

vi.mock('../ConversationRuntimeHost', () => ({
  useConversationRuntime: () => runtimeMock(),
}));

vi.mock('../ConversationFlow', () => ({
  ConversationFlow: ({
    emptyState,
    supplementalContent,
  }: {
    emptyState?: ReactNode;
    supplementalContent?: ReactNode;
  }) => <div data-testid="conversation-flow">{emptyState}{supplementalContent}</div>,
}));

vi.mock('../CapabilityInvocationCard', () => ({
  CapabilityInvocationCard: ({ invocationId }: { invocationId: string }) => (
    <div data-testid={`approval-card-${invocationId}`}>Approval card {invocationId}</div>
  ),
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
    identity: { userId: 'user-1', organizationId: 'organization-1' },
    approvalInvocationIds: [],
    ...overrides,
  };
}

describe('ConversationPanel', () => {
  beforeEach(() => {
    openConversationMock.mockReset();
    openSettingsMock.mockReset();
    runtimeMock.mockReturnValue(activeRuntime());
  });

  it('uses the selected context, shared flow, settings, history navigation, and close action', () => {
    const closeMock = vi.fn();
    render(<ConversationPanel onClose={closeMock} />);

    expect(screen.getByRole('heading', { name: '소싱 판단' })).toBeInTheDocument();
    expect(screen.getByText('소싱 Agent')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-context-mark-sourcing')).toBeVisible();
    expect(screen.getByTestId('conversation-flow')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '대화 설정' }));
    fireEvent.click(screen.getByRole('button', { name: 'AI 챗 닫기' }));

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '전체 기록' })).toHaveAttribute('href', '/agent-os');
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
    expect(screen.getByRole('menuitem', { name: '일반 AI 챗' })).toHaveFocus();

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

  it('uses the shared empty state without a duplicate start action', () => {
    runtimeMock.mockReturnValue(activeRuntime({
      activeConversation: null,
      draft: null,
      conversationId: null,
    }));

    render(<ConversationPanel onClose={vi.fn()} />);

    expect(screen.getByTestId('conversation-empty-state')).toBeVisible();
    expect(screen.queryByRole('button', { name: '새 AI 대화 시작' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /이번 주|상품 후보|운영 이슈/ })).toHaveLength(3);
  });

  it('passes streamed approval cards through the shared evidence lane without adding a decision action', () => {
    const invocationId = '00000000-0000-4000-8000-000000000001';
    runtimeMock.mockReturnValue(activeRuntime({ approvalInvocationIds: [invocationId] }));

    render(<ConversationPanel onClose={vi.fn()} />);

    expect(screen.getByTestId(`approval-card-${invocationId}`)).toHaveTextContent(`Approval card ${invocationId}`);
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });
});
