import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRightSurfaceLauncher } from '../right-surface-launcher-context';
import AppLayout from '../AppLayout';

const useAuthMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const usePanelStreamMock = vi.hoisted(() => vi.fn());
const readinessMock = vi.hoisted(() => vi.fn(() => null));
const generationWatcherMock = vi.hoisted(() => vi.fn(() => null));
const openConversationMock = vi.hoisted(() => vi.fn());
const rightAuxiliaryPropsMock = vi.hoisted(() => vi.fn());
const conversationSurfaceState = vi.hoisted(() => ({
  activeConversationId: null as string | null,
  pendingDraft: null as { conversationId: string; message: string } | null,
  reset: vi.fn(() => {
    conversationSurfaceState.activeConversationId = null;
    conversationSurfaceState.pendingDraft = null;
  }),
}));
const appStoreState = vi.hoisted(() => ({
  sidebarOpen: true,
  activeRightSurface: null as 'notifications' | 'ai_chat' | null,
  selectRightSurface(surface: 'notifications' | 'ai_chat') {
    appStoreState.activeRightSurface = appStoreState.activeRightSurface === surface ? null : surface;
  },
  closeRightSurface() {
    appStoreState.activeRightSurface = null;
  },
  resetRightSurface: vi.fn(() => {
    appStoreState.activeRightSurface = null;
  }),
}));
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
  useStore: (selector?: (state: typeof appStoreState) => unknown) =>
    selector ? selector(appStoreState) : appStoreState,
}));

vi.mock('../Sidebar', () => ({
  default: ({
    onChatToggle,
    onNotificationToggle,
  }: {
    onChatToggle?: (launcher: HTMLElement) => void;
    onNotificationToggle?: (launcher: HTMLElement) => void;
  }) => (
    <nav data-testid="sidebar">
      <button type="button" onClick={(event) => onChatToggle?.(event.currentTarget)}>AI 챗</button>
      <button type="button" onClick={(event) => onNotificationToggle?.(event.currentTarget)}>알림</button>
    </nav>
  ),
}));

vi.mock('@/components/ui/PageSkeleton', () => ({
  default: () => <div data-testid="page-skeleton" />,
}));

vi.mock('@/components/panel/hooks/usePanelStream', () => ({
  usePanelStream: () => usePanelStreamMock(),
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
  default: ({
    onOpenConversation,
    isAuxiliarySurfaceOpen,
  }: {
    onOpenConversation?: (launcher: HTMLElement) => void;
    isAuxiliarySurfaceOpen?: boolean;
  }) => (
    <button
      data-testid="quick-action"
      data-auxiliary-open={String(Boolean(isAuxiliarySurfaceOpen))}
      onClick={(event) => onOpenConversation?.(event.currentTarget)}
    >
      AI 챗 열기
    </button>
  ),
}));

vi.mock('../RightAuxiliaryPanel', () => ({
  RightAuxiliaryPanel: (props: {
    activeRightSurface: 'notifications' | 'ai_chat' | null;
    onClose(): void;
  }) => {
    rightAuxiliaryPropsMock(props);
    return (
      <div data-testid="right-auxiliary-panel">
        {props.activeRightSurface ?? 'closed'}
        <button type="button" onClick={props.onClose}>보조 패널 닫기</button>
      </div>
    );
  },
}));

vi.mock('@/components/agent-interaction/conversation-surface-state', () => ({
  openConversation: openConversationMock,
  useConversationSurfaceState: (selector: (state: typeof conversationSurfaceState) => unknown) =>
    selector(conversationSurfaceState),
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

function SourcingChatLauncher() {
  const { openConversationFromLauncher } = useRightSurfaceLauncher();
  return (
    <button
      type="button"
      onClick={(event) => openConversationFromLauncher(
        { fixedAgentKey: 'sourcing', draft: '소싱 질문' },
        event.currentTarget,
      )}
    >
      소싱 Agent에게 묻기
    </button>
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
    rightAuxiliaryPropsMock.mockReset();
    conversationSurfaceState.activeConversationId = null;
    conversationSurfaceState.pendingDraft = null;
    conversationSurfaceState.reset.mockClear();
    appStoreState.sidebarOpen = true;
    appStoreState.activeRightSurface = null;
    appStoreState.resetRightSurface.mockClear();
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

  it('transitions from loading to ready without changing AppLayout hook order', () => {
    let authState: {
      status: 'loading' | 'ready';
      user: { id: string; organizationId: string } | null;
      isLoading: boolean;
      logout: ReturnType<typeof vi.fn>;
    } = {
      status: 'loading' as const,
      user: null,
      isLoading: true,
      logout: vi.fn(),
    };
    useAuthMock.mockImplementation(() => authState);
    const view = renderLayout();

    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();

    authState = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-provider')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-runtime-host')).toBeInTheDocument();
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

  it('clears the prior user\'s right surface and unsent draft before a second user enters after logout', async () => {
    let authState: {
      status: 'ready' | 'anonymous';
      user: { id: string; organizationId: string } | null;
      isLoading: boolean;
      logout: ReturnType<typeof vi.fn>;
    } = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    useAuthMock.mockImplementation(() => authState);
    appStoreState.activeRightSurface = 'ai_chat';
    conversationSurfaceState.activeConversationId = 'draft-user-1';
    conversationSurfaceState.pendingDraft = {
      conversationId: 'draft-user-1',
      message: 'Keep this private',
    };
    const view = renderLayout();

    authState = {
      status: 'anonymous',
      user: null,
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    await waitFor(() => {
      expect(appStoreState.resetRightSurface).toHaveBeenCalledTimes(1);
      expect(conversationSurfaceState.reset).toHaveBeenCalledTimes(1);
    });
    expect(appStoreState.activeRightSurface).toBeNull();
    expect(conversationSurfaceState.pendingDraft).toBeNull();

    authState = {
      status: 'ready',
      user: { id: 'user-2', organizationId: 'org-2' },
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    expect(appStoreState.activeRightSurface).toBeNull();
    expect(conversationSurfaceState.pendingDraft).toBeNull();
  });

  it('clears the prior user\'s right surface and unsent draft on direct identity replacement', async () => {
    let authState: {
      status: 'ready';
      user: { id: string; organizationId: string };
      isLoading: boolean;
      logout: ReturnType<typeof vi.fn>;
    } = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    useAuthMock.mockImplementation(() => authState);
    appStoreState.activeRightSurface = 'ai_chat';
    conversationSurfaceState.activeConversationId = 'draft-user-1';
    conversationSurfaceState.pendingDraft = {
      conversationId: 'draft-user-1',
      message: 'Keep this private',
    };
    const view = renderLayout();

    authState = {
      status: 'ready',
      user: { id: 'user-2', organizationId: 'org-2' },
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    await waitFor(() => {
      expect(appStoreState.resetRightSurface).toHaveBeenCalledTimes(1);
      expect(conversationSurfaceState.reset).toHaveBeenCalledTimes(1);
    });
    expect(appStoreState.activeRightSurface).toBeNull();
    expect(conversationSurfaceState.pendingDraft).toBeNull();
  });

  it.each([
    ['user', { id: 'user-2', organizationId: 'org-1' }],
    ['organization', { id: 'user-1', organizationId: 'org-2' }],
  ])('remounts the authenticated conversation runtime shell when the %s identity coordinate changes', (_coordinate, nextUser) => {
    let authState: {
      status: 'ready';
      user: { id: string; organizationId: string };
      isLoading: boolean;
      logout: ReturnType<typeof vi.fn>;
    } = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    useAuthMock.mockImplementation(() => authState);
    const view = renderLayout();

    authState = {
      status: 'ready',
      user: nextUser,
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    expect(runtimeOwnershipMocks.providerUnmounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.hostUnmounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.providerMounted).toHaveBeenCalledTimes(2);
    expect(runtimeOwnershipMocks.hostMounted).toHaveBeenCalledTimes(2);
  });

  it('preserves the same user\'s right surface and unsent draft across route and loading refreshes', () => {
    let authState: {
      status: 'loading' | 'ready';
      user: { id: string; organizationId: string } | null;
      isLoading: boolean;
      logout: ReturnType<typeof vi.fn>;
    } = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    useAuthMock.mockImplementation(() => authState);
    appStoreState.activeRightSurface = 'ai_chat';
    conversationSurfaceState.activeConversationId = 'draft-user-1';
    conversationSurfaceState.pendingDraft = {
      conversationId: 'draft-user-1',
      message: 'Keep this private',
    };
    const view = renderLayout();

    usePathnameMock.mockReturnValue('/orders');
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    authState = {
      status: 'loading',
      user: null,
      isLoading: true,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    authState = {
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    };
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    expect(appStoreState.resetRightSurface).not.toHaveBeenCalled();
    expect(conversationSurfaceState.reset).not.toHaveBeenCalled();
    expect(appStoreState.activeRightSurface).toBe('ai_chat');
    expect(conversationSurfaceState.pendingDraft).toEqual({
      conversationId: 'draft-user-1',
      message: 'Keep this private',
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'AI 챗 열기' }));
    expect(openConversationMock).toHaveBeenCalledWith({ fixedAgentKey: null });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('uses the shared 256px expanded and 64px collapsed sidebar offsets for Dashboard content', () => {
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    const view = renderLayout();
    expect(screen.getByTestId('dashboard-content-offset')).toHaveClass('md:ml-[256px]');

    appStoreState.sidebarOpen = false;
    view.rerender(<AppLayout><main data-testid="protected-child">Protected child</main></AppLayout>);

    expect(screen.getByTestId('dashboard-content-offset')).toHaveClass('md:ml-[64px]');
  });

  it('mounts exactly one derived right surface and hides the fixed Quick Action FAB while a surface is active', () => {
    appStoreState.activeRightSurface = 'notifications';
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('notifications');
    expect(screen.getByTestId('quick-action')).toHaveAttribute('data-auxiliary-open', 'true');
    expect(screen.getByTestId('authenticated-work-surface')).toHaveClass('2xl:mr-[352px]');
    expect(screen.getByTestId('authenticated-work-surface')).not.toHaveClass('lg:mr-[352px]');
    expect(rightAuxiliaryPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      activeRightSurface: 'notifications',
    }));
  });

  it('captures a route launcher through the app-shell contract before opening its fixed draft', () => {
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });
    renderLayout(<SourcingChatLauncher />);
    const launcher = screen.getByRole('button', { name: '소싱 Agent에게 묻기' });

    fireEvent.click(launcher);

    expect(openConversationMock).toHaveBeenCalledWith({
      fixedAgentKey: 'sourcing',
      draft: '소싱 질문',
    });
    const props = rightAuxiliaryPropsMock.mock.calls.at(-1)?.[0] as {
      launcherRef: { current: HTMLElement | null };
    };
    expect(props.launcherRef.current).toBe(launcher);
  });

  it('restores the selected conversation when chat replaces notifications instead of creating a new draft', () => {
    appStoreState.activeRightSurface = 'notifications';
    conversationSurfaceState.activeConversationId = 'conversation-1';
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'AI 챗' }));

    expect(appStoreState.activeRightSurface).toBe('ai_chat');
    expect(openConversationMock).not.toHaveBeenCalled();
  });

  it('suppresses only the duplicate AI chat body on Agent OS without clearing its selected surface', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    appStoreState.activeRightSurface = 'ai_chat';
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('closed');
    expect(appStoreState.activeRightSurface).toBe('ai_chat');
    expect(screen.getByTestId('conversation-runtime-host')).toBeInTheDocument();
  });

  it('restores a suppressed AI chat body after navigating back to a normal route without remounting runtime ownership', () => {
    appStoreState.activeRightSurface = 'ai_chat';
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });
    const view = renderLayout();

    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('ai_chat');

    usePathnameMock.mockReturnValue('/agent-os');
    view.rerender(<AppLayout><main data-testid="agent-presentation">Agent workspace</main></AppLayout>);
    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('closed');
    expect(appStoreState.activeRightSurface).toBe('ai_chat');

    usePathnameMock.mockReturnValue('/dashboard');
    view.rerender(<AppLayout><main data-testid="normal-presentation">Normal presentation</main></AppLayout>);
    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('ai_chat');
    expect(runtimeOwnershipMocks.providerMounted).toHaveBeenCalledTimes(1);
    expect(runtimeOwnershipMocks.hostMounted).toHaveBeenCalledTimes(1);
  });

  it('keeps notifications visible on Agent OS and does not unmount the conversation runtime when a panel closes', () => {
    usePathnameMock.mockReturnValue('/agent-os');
    appStoreState.activeRightSurface = 'notifications';
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: '보조 패널 닫기' }));

    expect(screen.getByTestId('right-auxiliary-panel')).toHaveTextContent('notifications');
    expect(appStoreState.activeRightSurface).toBeNull();
    expect(runtimeOwnershipMocks.hostUnmounted).not.toHaveBeenCalled();
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
    expect(usePanelStreamMock).toHaveBeenCalledTimes(1);
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
