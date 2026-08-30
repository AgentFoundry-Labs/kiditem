import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationSettingsDialog } from '@/components/agent-interaction/ConversationSettingsDialog';
import { useConversationSurfaceState } from '@/components/agent-interaction/conversation-surface-state';
import { RightAuxiliaryPanel } from '../RightAuxiliaryPanel';
import {
  DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY,
  useDesktopAiChatWidth,
} from '../useDesktopAiChatWidth';

vi.mock('@/components/panel/NotificationPanelContent', () => ({
  NotificationPanelContent: () => (
    <h2 data-right-auxiliary-heading tabIndex={-1}>알림</h2>
  ),
}));

vi.mock('@/components/agent-interaction/ConversationPanel', () => ({
  ConversationPanel: ({ onClose }: { onClose(): void }) => (
    <div>
      <h2 data-right-auxiliary-heading tabIndex={-1}>일반 AI 챗</h2>
      <button type="button" onClick={onClose}>AI 챗 닫기</button>
    </div>
  ),
}));

function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 767px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function launcherRef(surface = 'ai_chat') {
  const launcher = document.createElement('button');
  launcher.textContent = 'AI 챗 실행';
  launcher.dataset.testLauncher = 'true';
  launcher.dataset.rightSurfaceLauncher = surface;
  document.body.appendChild(launcher);
  return { current: launcher };
}

function desktopAiChatWidth(width = 480) {
  return {
    width,
    previewWidth: vi.fn(),
    commitWidth: vi.fn(),
    cancelPreview: vi.fn(),
  };
}

function DesktopWidthLifecycleHarness() {
  const [activeRightSurface, setActiveRightSurface] = useState<'ai_chat' | null>('ai_chat');
  const controller = useDesktopAiChatWidth();
  const panelLauncherRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <output data-testid="desktop-ai-chat-width">{controller.width}</output>
      <button type="button" onClick={() => setActiveRightSurface('ai_chat')}>AI 챗 다시 열기</button>
      <RightAuxiliaryPanel
        activeRightSurface={activeRightSurface}
        onClose={() => setActiveRightSurface(null)}
        launcherRef={panelLauncherRef}
        desktopAiChatWidth={controller}
      />
    </>
  );
}

function SettingsOverPanelHarness({
  launcherRef: panelLauncherRef,
  onPanelClose,
  onSettingsClose,
}: {
  launcherRef: ReturnType<typeof launcherRef>;
  onPanelClose(): void;
  onSettingsClose(): void;
}) {
  const [activeRightSurface, setActiveRightSurface] = useState<'ai_chat' | null>('ai_chat');
  const settingsOpen = useConversationSurfaceState((state) => state.settingsOpen);
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  const closeSettings = useConversationSurfaceState((state) => state.closeSettings);

  return (
    <>
      <button type="button" onClick={(event) => openSettings(event.currentTarget)}>대화 설정 열기</button>
      <RightAuxiliaryPanel
        activeRightSurface={activeRightSurface}
        onClose={() => {
          onPanelClose();
          setActiveRightSurface(null);
        }}
        launcherRef={panelLauncherRef}
      />
      <ConversationSettingsDialog
        open={settingsOpen}
        onClose={() => {
          onSettingsClose();
          closeSettings();
        }}
        conversations={[]}
        activeConversationId={null}
        isRunning={false}
        preferences={{ schemaVersion: 1, contexts: {} }}
        preferencesLoading={false}
        preferencesError={false}
        readiness={[]}
        onSavePreference={async () => ({ schemaVersion: 1, contexts: {} })}
        onRenameConversation={async () => {
          throw new Error('not expected');
        }}
        onDeleteConversation={async () => {}}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  useConversationSurfaceState.getState().reset();
  document.querySelectorAll('[data-test-launcher]').forEach((node) => node.remove());
});

describe('RightAuxiliaryPanel', () => {
  it('uses one fixed 352px non-modal desktop surface without an overlay or page reflow', async () => {
    mockViewport(false);
    const closeMock = vi.fn();
    const ref = launcherRef();

    render(
      <RightAuxiliaryPanel
        activeRightSurface="notifications"
        onClose={closeMock}
        launcherRef={ref}
      />,
    );

    const panel = screen.getByTestId('right-auxiliary-panel');
    expect(panel).toHaveClass('fixed', 'right-0', 'w-[352px]');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'AI 챗 패널 너비 조절' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-auxiliary-overlay')).not.toBeInTheDocument();
    expect(document.querySelector('[data-right-auxiliary-page-reflow]')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: '알림' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: '알림 패널 닫기' }));
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('renders AI chat at its supplied desktop width with one accessible left-edge separator', async () => {
    mockViewport(false);
    const closeMock = vi.fn();
    const ref = launcherRef();
    const width = desktopAiChatWidth(480);

    render(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={closeMock}
        launcherRef={ref}
        desktopAiChatWidth={width}
      />,
    );

    const panel = screen.getByTestId('right-auxiliary-panel');
    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    expect(panel).toHaveClass('w-[var(--right-auxiliary-width)]');
    expect(panel.style.getPropertyValue('--right-auxiliary-width')).toBe('480px');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuemin', '320');
    expect(separator).toHaveAttribute('aria-valuemax', '640');
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    await waitFor(() => expect(screen.getByRole('heading', { name: '일반 AI 챗' })).toHaveFocus());
  });

  it('previews a pointer drag live, commits on release, and cancels a captured drag', () => {
    mockViewport(false);
    const ref = launcherRef();
    const width = desktopAiChatWidth(480);

    render(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={vi.fn()}
        launcherRef={ref}
        desktopAiChatWidth={width}
      />,
    );

    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(separator, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 7 });
    fireEvent.pointerMove(separator, { clientX: 552, pointerId: 7 });
    fireEvent.pointerUp(separator, { clientX: 536, pointerId: 7 });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(width.previewWidth).toHaveBeenLastCalledWith(528);
    expect(width.commitWidth).toHaveBeenCalledWith(544);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 8 });
    fireEvent.pointerMove(separator, { clientX: 568, pointerId: 8 });
    fireEvent.pointerCancel(separator, { clientX: 568, pointerId: 8 });

    expect(width.cancelPreview).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(8);
  });

  it('rolls an uncommitted drag back to the saved width when Escape closes and reopens AI chat', async () => {
    mockViewport(false);
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '496');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<DesktopWidthLifecycleHarness />);

    await waitFor(() => expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('496'));
    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    Object.defineProperties(separator, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 12 });
    fireEvent.pointerMove(separator, { clientX: 616, pointerId: 12 });

    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('480');
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('496');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('separator', { name: 'AI 챗 패널 너비 조절' })).not.toBeInTheDocument());
    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('496');
    expect(setItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'AI 챗 다시 열기' }));

    expect(screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' })).toHaveAttribute('aria-valuenow', '496');
  });

  it('rolls an uncommitted drag back when pointer capture is lost', async () => {
    mockViewport(false);
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '496');

    render(<DesktopWidthLifecycleHarness />);

    await waitFor(() => expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('496'));
    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    Object.defineProperties(separator, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => false },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 13 });
    fireEvent.pointerMove(separator, { clientX: 616, pointerId: 13 });
    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('480');

    fireEvent.lostPointerCapture(separator, { pointerId: 13 });

    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('496');
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('496');
  });

  it('keeps a committed drag when its pointer capture is subsequently lost', async () => {
    mockViewport(false);
    window.localStorage.setItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY, '496');

    render(<DesktopWidthLifecycleHarness />);

    await waitFor(() => expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('496'));
    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    Object.defineProperties(separator, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 14 });
    fireEvent.pointerMove(separator, { clientX: 616, pointerId: 14 });
    fireEvent.pointerUp(separator, { clientX: 616, pointerId: 14 });

    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('480');
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('480');

    fireEvent.lostPointerCapture(separator, { pointerId: 14 });

    expect(screen.getByTestId('desktop-ai-chat-width')).toHaveTextContent('480');
    expect(window.localStorage.getItem(DESKTOP_AI_CHAT_WIDTH_STORAGE_KEY)).toBe('480');
  });

  it('widens with ArrowLeft and narrows with ArrowRight in 16px steps', () => {
    mockViewport(false);
    const ref = launcherRef();
    const width = desktopAiChatWidth(480);

    render(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={vi.fn()}
        launcherRef={ref}
        desktopAiChatWidth={width}
      />,
    );

    const separator = screen.getByRole('separator', { name: 'AI 챗 패널 너비 조절' });
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });

    expect(width.commitWidth).toHaveBeenNthCalledWith(1, 496);
    expect(width.commitWidth).toHaveBeenNthCalledWith(2, 464);
  });

  it('uses the same content as a full-width modal drawer below 768px and returns focus on Escape', async () => {
    mockViewport(true);
    const closeMock = vi.fn();
    const ref = launcherRef();
    ref.current.focus();

    const view = render(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={closeMock}
        launcherRef={ref}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('fixed', 'inset-0', 'w-full');
    expect(screen.getByTestId('right-auxiliary-overlay')).toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'AI 챗 패널 너비 조절' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: '일반 AI 챗' })).toHaveFocus());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeMock).toHaveBeenCalledTimes(1);
    view.rerender(
      <RightAuxiliaryPanel activeRightSurface={null} onClose={closeMock} launcherRef={ref} />,
    );
    await waitFor(() => expect(ref.current).toHaveFocus());
  });

  it('lets a topmost conversation settings dialog consume Escape while AI chat remains open and focused', async () => {
    mockViewport(false);
    const panelCloseMock = vi.fn();
    const settingsCloseMock = vi.fn();
    const ref = launcherRef();

    render(
      <SettingsOverPanelHarness
        launcherRef={ref}
        onPanelClose={panelCloseMock}
        onSettingsClose={settingsCloseMock}
      />,
    );

    const chatHeading = screen.getByRole('heading', { name: '일반 AI 챗' });
    await waitFor(() => expect(chatHeading).toHaveFocus());
    const settingsTrigger = screen.getByRole('button', { name: '대화 설정 열기' });
    fireEvent.click(settingsTrigger);

    const settingsDialog = await screen.findByRole('dialog', { name: '대화 설정' });
    fireEvent.keyDown(settingsDialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대화 설정' })).not.toBeInTheDocument());
    expect(settingsCloseMock).toHaveBeenCalledTimes(1);
    expect(panelCloseMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('right-auxiliary-panel')).toBeInTheDocument();
    await waitFor(() => expect(settingsTrigger).toHaveFocus());
    expect(ref.current).not.toHaveFocus();
  });

  it('replaces the body in one slot and focuses the replacement without interrupting a conversation runtime', async () => {
    mockViewport(false);
    const closeMock = vi.fn();
    const ref = launcherRef();
    const view = render(
      <RightAuxiliaryPanel
        activeRightSurface="notifications"
        onClose={closeMock}
        launcherRef={ref}
      />,
    );

    view.rerender(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={closeMock}
        launcherRef={ref}
      />,
    );

    expect(screen.queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '일반 AI 챗' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: '일반 AI 챗' })).toHaveFocus());
  });

  it('restores focus to the Quick Action launcher when its expanded chat action has unmounted', async () => {
    mockViewport(false);
    const closeMock = vi.fn();
    const ref = launcherRef('quick-action-ai-chat');
    const view = render(
      <RightAuxiliaryPanel
        activeRightSurface="ai_chat"
        onClose={closeMock}
        launcherRef={ref}
      />,
    );
    const sidebarLauncher = document.createElement('button');
    sidebarLauncher.dataset.testLauncher = 'true';
    sidebarLauncher.dataset.rightSurfaceLauncher = 'ai_chat';
    const quickActionTrigger = document.createElement('button');
    quickActionTrigger.dataset.testLauncher = 'true';
    quickActionTrigger.dataset.rightSurfaceLauncher = 'quick-action-ai-chat';
    ref.current.remove();
    document.body.append(sidebarLauncher, quickActionTrigger);

    view.rerender(
      <RightAuxiliaryPanel activeRightSurface={null} onClose={closeMock} launcherRef={ref} />,
    );

    await waitFor(() => expect(quickActionTrigger).toHaveFocus());
  });

  it('does not use measured or persisted dock state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/layout/RightAuxiliaryPanel.tsx'),
      'utf8',
    );
    const appLayoutSource = readFileSync(
      resolve(process.cwd(), 'src/components/layout/AppLayout.tsx'),
      'utf8',
    );

    expect(source).not.toContain('ResizeObserver');
    expect(source).not.toContain('remainingWidth');
    expect(source).not.toMatch(/dock(?:Mode|State)?/i);
    expect(appLayoutSource).not.toContain('ResizeObserver');
    expect(appLayoutSource).not.toContain('remainingWidth');
    expect(appLayoutSource).not.toMatch(/dock(?:Mode|State)?/i);
    expect(appLayoutSource).not.toMatch(/localStorage|sessionStorage/);
  });
});
