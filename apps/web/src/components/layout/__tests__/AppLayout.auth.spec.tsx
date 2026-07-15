import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../AppLayout';

const useAuthMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const usePanelStreamMock = vi.hoisted(() => vi.fn());
const readinessMock = vi.hoisted(() => vi.fn(() => null));
const generationWatcherMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

// Current AppLayout used to depend on useAuthSession directly. Keep this mock
// permissive so this test proves the new protected-shell gate, not provider setup.
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthSession: () => ({ session: null, isLoading: false }),
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
  default: () => <div data-testid="quick-action" />,
  isQuickActionFabSuppressed: (pathname: string) => [
    '/inventory-hub',
    '/purchase-orders',
    '/order-hub',
    '/product-hub',
    '/product-hub/matching',
  ].includes(pathname),
}));

function renderLayout() {
  return render(
    <AppLayout>
      <main data-testid="protected-child">Protected child</main>
    </AppLayout>,
  );
}

describe('AppLayout auth gate', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    replaceMock.mockReset();
    usePathnameMock.mockReset();
    usePanelStreamMock.mockReset();
    readinessMock.mockClear();
    generationWatcherMock.mockClear();
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
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();
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
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(usePanelStreamMock).toHaveBeenCalledTimes(1);
    expect(readinessMock).toHaveBeenCalledTimes(1);
    expect(generationWatcherMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/inventory-hub',
    '/purchase-orders',
    '/order-hub',
    '/product-hub',
    '/product-hub/matching',
  ])('does not mount the quick action button on %s', (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    useAuthMock.mockReturnValue({
      status: 'ready',
      user: { id: 'user-1', organizationId: 'org-1' },
      isLoading: false,
      logout: vi.fn(),
    });

    renderLayout();

    expect(screen.queryByTestId('quick-action')).not.toBeInTheDocument();
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
    expect(usePanelStreamMock).not.toHaveBeenCalled();
    expect(readinessMock).not.toHaveBeenCalled();
    expect(generationWatcherMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '로그인으로 돌아가기' }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
