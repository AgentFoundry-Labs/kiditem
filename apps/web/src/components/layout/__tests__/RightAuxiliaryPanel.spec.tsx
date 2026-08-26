import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightAuxiliaryPanel } from '../RightAuxiliaryPanel';

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

afterEach(() => {
  document.querySelectorAll('[data-test-launcher]').forEach((node) => node.remove());
});

describe('RightAuxiliaryPanel', () => {
  it('uses one fixed 420px non-modal desktop surface without an overlay or page reflow', async () => {
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
    expect(panel).toHaveClass('fixed', 'right-0', 'w-[420px]');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-auxiliary-overlay')).not.toBeInTheDocument();
    expect(document.querySelector('[data-right-auxiliary-page-reflow]')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: '알림' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: '알림 패널 닫기' }));
    expect(closeMock).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(screen.getByRole('heading', { name: '일반 AI 챗' })).toHaveFocus());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeMock).toHaveBeenCalledTimes(1);
    view.rerender(
      <RightAuxiliaryPanel activeRightSurface={null} onClose={closeMock} launcherRef={ref} />,
    );
    await waitFor(() => expect(ref.current).toHaveFocus());
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

  it('does not use ResizeObserver or a remaining-page-width calculation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/layout/RightAuxiliaryPanel.tsx'),
      'utf8',
    );

    expect(source).not.toContain('ResizeObserver');
    expect(source).not.toContain('remainingWidth');
    expect(source).not.toContain('dock');
  });
});
