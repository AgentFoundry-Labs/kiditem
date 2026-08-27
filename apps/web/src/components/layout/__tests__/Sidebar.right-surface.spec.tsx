import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../Sidebar';

const usePathnameMock = vi.hoisted(() => vi.fn());
const appStoreState = vi.hoisted(() => ({
  sidebarOpen: true,
  toggleSidebar: vi.fn(),
  setSidebarOpen: vi.fn(),
  editorDirty: false,
  setEditorDirty: vi.fn(),
  showConfirm: vi.fn(),
}));

const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector?: (state: typeof appStoreState) => unknown) =>
    selector ? selector(appStoreState) : appStoreState,
}));

vi.mock('@/components/panel/lib/panel-store', () => ({
  usePanelStore: (selector: (state: {
    unreadCount(): number;
    runningCount(): number;
  }) => unknown) => selector({ unreadCount: () => 0, runningCount: () => 0 }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

describe('Sidebar right auxiliary launchers', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/dashboard');
    appStoreState.sidebarOpen = true;
    appStoreState.toggleSidebar.mockClear();
    appStoreState.setSidebarOpen.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it('opens the same chat and notification surfaces from expanded and collapsed navigation', () => {
    const onChatToggle = vi.fn();
    const onNotificationToggle = vi.fn();
    const view = render(
      <Sidebar
        onChatToggle={onChatToggle}
        onNotificationToggle={onNotificationToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 챗' }));
    fireEvent.click(screen.getByRole('button', { name: '알림' }));

    expect(onChatToggle).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    expect(onNotificationToggle).toHaveBeenCalledWith(expect.any(HTMLButtonElement));

    view.rerender(
      <Sidebar
        lockCollapsed
        onChatToggle={onChatToggle}
        onNotificationToggle={onNotificationToggle}
      />,
    );

    fireEvent.click(screen.getByTitle('AI 챗'));
    fireEvent.click(screen.getByTitle('알림'));

    expect(onChatToggle).toHaveBeenCalledTimes(2);
    expect(onNotificationToggle).toHaveBeenCalledTimes(2);
    expect(onChatToggle.mock.calls[1][0]).toBeInstanceOf(HTMLButtonElement);
    expect(onNotificationToggle.mock.calls[1][0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps separate collapsed home and expand actions while retaining the AI chat launcher', () => {
    appStoreState.sidebarOpen = false;
    const onChatToggle = vi.fn();

    render(<Sidebar onChatToggle={onChatToggle} />);

    expect(screen.getByTestId('collapsible-sidebar-shell')).toBeInTheDocument();
    const home = screen.getByRole('link', { name: 'KidItem 홈' });
    const expand = screen.getByRole('button', { name: '사이드바 펼치기' });
    expect(home).not.toBe(expand);

    fireEvent.click(expand);
    fireEvent.click(screen.getByTitle('AI 챗'));

    expect(appStoreState.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(onChatToggle).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('keeps the desktop sidebar preference untouched while the mobile drawer renders and routes change', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(max-width: 767px)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
    appStoreState.sidebarOpen = true;

    const view = render(<Sidebar />);
    usePathnameMock.mockReturnValue('/agent-os');
    view.rerender(<Sidebar />);

    expect(appStoreState.setSidebarOpen).not.toHaveBeenCalled();
    expect(appStoreState.sidebarOpen).toBe(true);
  });
});
