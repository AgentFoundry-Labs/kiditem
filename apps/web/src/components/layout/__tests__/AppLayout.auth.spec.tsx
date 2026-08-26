import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../AppLayout';

const useAuthMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const usePanelStreamMock = vi.hoisted(() => vi.fn());
const readinessMock = vi.hoisted(() => vi.fn(() => null));
const generationWatcherMock = vi.hoisted(() => vi.fn(() => null));
const openConversationMock = vi.hoisted(() => vi.fn());
const runtimeOwnershipMocks = vi.hoisted(() => ({
  providerMounted: vi.fn(),
  providerUnmounted: vi.fn(),
  hostMounted: vi.fn(),
  hostUnmounted: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({ sidebarOpen: true }),
}));

vi.mock('../Sidebar', () => ({
  default: () => <nav data-testid="sidebar" />,
}));

vi.mock('@/components/ui/PageSkeleton', () => ({
  default: () => <div data-testid="page-skeleton" />,
}));

vi.mock('@/components/panel/hooks/usePanelStream', () => ({
  usePanelStream: () => usePanelStreamMock(),
}));

vi.mock('@/components/panel/PanelSheet', () => ({
  PanelSheet: () => <div data-testid="panel-sheet" />,
}));

vi.mock('@/components/panel/PanelErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ReadinessModal', () => ({
  default: () => readinessMock(),
}));

vi.mock('@/components/RebuildReadinessBanner', () => ({
  default: () => null,
}));

vi.mock('@/components/GenerationCompletionWatcher', () => ({
  default: () => generationWatcherMock(),
}));

vi.mock('@/components/GlobalConfirmDialog', () => ({
  default: () => <div data-testid="confirm-dialog" />,
}));

vi.mock('@/components/QuickActionFab', () => ({
  default: ({ onOpenConversation }: { onOpenConversation?: () => void }) => (
    <button data-testid="quick-action" onClick={onOpenConversation}>AgentOS 대화 열기</button>
  ),
}));

vi.mock('@/components/agent-interaction/conversation-surface-state', () => ({
  openConversation: openConversationMock,
}));

vi.mock('@/components/agent-interaction/ConversationProvider', () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      runtimeOwnershipMocks.providerMounted();
      return () => runtimeOwnershipMocks.providerUnmounted();
    }, []);
    return <div data-testid="conversation-provider">{children}</div>;
  },
}));

vi.mock('@/components/agent-interaction/ConversationRuntimeHost', () => ({
  ConversationRuntimeHost: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      runtimeOwnershipMocks.hostMounted();
      return () => runtimeOwnershipMocks.hostUnmounted();
    }, []);
    return <div data-testid="conversation-runtime-host">{children}</div>;
  },
}));

function renderLayout(children: React.ReactNode = <main data-testid="protected-child">Protected child</main>) {
  return render(
    <AppLayout>
      {children}
    </AppLayout>,
  );
}

describe('AppLayout auth gate', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    replaceMock.mockReset();
    pushMock.mockReset();
    usePathnameMock.mockReset();
    usePanelStreamMock.mockReset();
    readinessMock.mockClear();
    generationWatcherMock.mockClear();
    openConversationMock.mockReset();
    Object.values(runtimeOwnershipMocks).forEach((mock) => mock.mockReset());
    usePathnameMock.mockReturnValue('/dashboard');
    window.history.pushState({}, '', '/dashboard');
  });

  it('does not mount protected children or background runtime until KidItem identity is ready', () => {
    useAuthMock.mockReturnValue({
      status: 'loading',
      user: null,
      isLoading: true,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
  });

  it('keeps the Agent workspace and CopilotKit provider unmounted while identity is loading', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    useAuthMock.mockReturnValue({
      status: 'loading',
      user: null,
      isLoading: true,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
  });

  it('redirects anonymous protected navigation to login without starting background runtime', async () => {
    useAuthMock.mockReturnValue({
      status: 'anonymous',
      user: null,
      isLoading: false,
      logout: vi.fn(),
    });
    window.history.pushState({}, '', '/dashboard?tab=orders');

    renderLayout();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Dorders');
    });
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();
  });

  it('redirects anonymous Agent workspace navigation before mounting its provider', async () => {
    usePathnameMock.mockReturnValue('/agent-os');
    useAuthMock.mockReturnValue({
      status: 'anonymous',
      user: null,
      isLoading: false,
      logout: vi.fn(),
    });
    window.history.pushState({}, '', '/agent-os');

    renderLayout();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fagent-os');
    });
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
  });

  it('mounts protected children and background runtime once KidItem identity is ready', () => {
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-provider')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-runtime-host')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(usePanelStreamMock).toHaveBeenCalledTimes(1);
    expect(readinessMock).toHaveBeenCalledTimes(1);
    expect(generationWatcherMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'AgentOS 대화 열기' }));
    expect(openConversationMock).toHaveBeenCalledWith({ fixedAgentKey: null });
    expect(pushMock).toHaveBeenCalledWith('/agent-os');
  });

  it.each([
    '/inventory-hub',
    '/purchase-orders',
    '/orders',
    '/product-hub',
    '/product-hub/matching',
  ])('keeps the former quick action button on %s', (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('quick-action')).toBeInTheDocument();
  });

  it('keeps the quick action button on unrelated protected routes', () => {
    usePathnameMock.mockReturnValue('/dashboard');
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('quick-action')).toBeInTheDocument();
  });

  it('keeps the fullscreen Agent workspace inside the CopilotKit provider', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-provider')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-runtime-host')).toBeInTheDocument();
  });

  it('keeps one provider and runtime-host subscription while normal and Agent workspace presentations swap', () => {
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });
    const view = renderLayout(<main data-testid="normal-presentation">Normal presentation</main>);

    expect(screen.getByTestId('conversation-provider')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-runtime-host')).toBeInTheDocument();
    expect(runtimeOwnershipMocks.providerMounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.hostMounted).toHaveBeenCalledTimes(1);

    usePathnameMock.mockReturnValue('/agent-os');
    view.rerender(<AppLayout><main data-testid="agent-presentation">Agent workspace</main></AppLayout>);
    expect(screen.getByTestId('agent-presentation')).toBeInTheDocument();

    usePathnameMock.mockReturnValue('/dashboard');
    view.rerender(<AppLayout><main data-testid="remounted-presentation">Normal presentation remounted</main></AppLayout>);
    expect(screen.getByTestId('remounted-presentation')).toBeInTheDocument();
    expect(runtimeOwnershipMocks.providerMounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.providerUnmounted).not.toHaveBeenCalled();
    expect(runtimeOwnershipMocks.hostMounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.hostUnmounted).not.toHaveBeenCalled();
  });

  it('keeps public surfaces outside the conversation runtime owner', () => {
    usePathnameMock.mockReturnValue('/');
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
  });

  it('shows organization guidance without starting background runtime when membership is missing', () => {
    const logoutMock = vi.fn();
    useAuthMock.mockReturnValue({
      status: 'no_organization',
      user: { id: 'user-1', organizationId: null },
      isLoading: false,
      logout: logoutMock,
    });

    renderLayout();

    expect(screen.getByText('조직 연결이 필요합니다')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '로그인으로 돌아가기' }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the Agent workspace provider behind the organization-membership gate', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    useAuthMock.mockReturnValue({
      status: 'no_organization',
      user: { id: 'user-1', organizationId: null },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByText('조직 연결이 필요합니다')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
  });

  it('keeps the Agent workspace provider behind an auth-error gate', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    useAuthMock.mockReturnValue({
      status: 'error',
      user: null,
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByText('로그인 상태를 확인하지 못했습니다')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-runtime-host')).not.toBeInTheDocument();
  });
});
