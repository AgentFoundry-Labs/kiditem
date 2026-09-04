'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { ConversationPanel } from '@/components/agent-interaction/ConversationPanel';
import { AlertsPopover } from '@/components/alerts/AlertsPopover';
import type { ActiveRightSurface } from '@/store/useStore';
import {
  clampDesktopAiChatWidth,
  DEFAULT_DESKTOP_AI_CHAT_WIDTH,
  MAX_DESKTOP_AI_CHAT_WIDTH,
  MIN_DESKTOP_AI_CHAT_WIDTH,
  type DesktopAiChatWidthController,
} from './useDesktopAiChatWidth';

interface RightAuxiliaryPanelProps {
  activeRightSurface: ActiveRightSurface;
  onClose(): void;
  launcherRef: RefObject<HTMLElement | null>;
  desktopAiChatWidth?: DesktopAiChatWidthController;
}

const fallbackDesktopAiChatWidth: DesktopAiChatWidthController = {
  width: DEFAULT_DESKTOP_AI_CHAT_WIDTH,
  previewWidth: () => {},
  commitWidth: () => {},
  cancelPreview: () => {},
};

export function RightAuxiliaryPanel({
  activeRightSurface,
  onClose,
  launcherRef,
  desktopAiChatWidth = fallbackDesktopAiChatWidth,
}: RightAuxiliaryPanelProps) {
  const isMobile = useMobileAuxiliaryPanel();
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyVisibleRef = useRef<ActiveRightSurface>(null);

  useEffect(() => {
    if (activeRightSurface) {
      const focusHeading = () => panelRef.current
        ?.querySelector<HTMLElement>('[data-right-auxiliary-heading]')
        ?.focus();
      focusHeading();
      const timer = window.setTimeout(focusHeading, 0);
      previouslyVisibleRef.current = activeRightSurface;
      return () => window.clearTimeout(timer);
    } else if (previouslyVisibleRef.current) {
      focusLauncher(launcherRef);
    }
    previouslyVisibleRef.current = activeRightSurface;
  }, [activeRightSurface, launcherRef]);

  useEffect(() => {
    if (!activeRightSurface) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeRightSurface, onClose]);

  if (!activeRightSurface) return null;

  const content = <PanelBody activeRightSurface={activeRightSurface} onClose={onClose} />;

  if (isMobile) {
    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            data-testid="right-auxiliary-overlay"
            className="fixed inset-0 z-[90] bg-black/30"
          />
          <Dialog.Content
            asChild
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <PanelFrame ref={panelRef} mobile>
              <Dialog.Title className="sr-only">
                {rightSurfaceLabel(activeRightSurface)}
              </Dialog.Title>
              {content}
            </PanelFrame>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  const isDesktopAiChat = activeRightSurface === 'ai_chat';

  return (
    <PanelFrame ref={panelRef} desktopWidth={isDesktopAiChat ? desktopAiChatWidth.width : undefined}>
      {isDesktopAiChat ? <DesktopAiChatResizeHandle controller={desktopAiChatWidth} /> : null}
      {content}
    </PanelFrame>
  );
}

const PanelFrame = forwardRef<HTMLElement, {
  children: ReactNode;
  mobile?: boolean;
  desktopWidth?: number;
}>(function PanelFrame({ children, mobile = false, desktopWidth }, ref) {
  const resizableDesktopAiChat = !mobile && desktopWidth !== undefined;
  return (
    <section
      ref={ref}
      data-testid="right-auxiliary-panel"
      role={mobile ? 'dialog' : 'complementary'}
      aria-label="오른쪽 보조 패널"
      style={resizableDesktopAiChat
        ? { '--right-auxiliary-width': `${desktopWidth}px` } as CSSProperties
        : undefined}
      className={mobile
        ? 'fixed inset-0 z-[100] flex w-full max-w-none flex-col bg-background shadow-xl outline-none'
        : `fixed inset-y-0 right-0 z-[90] flex max-w-full flex-col border-l bg-background shadow-sm ${
          resizableDesktopAiChat ? 'w-[var(--right-auxiliary-width)]' : 'w-[352px]'
        }`}
    >
      {children}
    </section>
  );
});

function DesktopAiChatResizeHandle({
  controller,
}: {
  controller: DesktopAiChatWidthController;
}) {
  const { cancelPreview, commitWidth, previewWidth, width } = controller;
  const dragRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const widthForClientX = (clientX: number): number | null => {
    const drag = dragRef.current;
    if (!drag) return null;
    return clampDesktopAiChatWidth(drag.startWidth + drag.startX - clientX);
  };
  const isActivePointer = (pointerId: number) => activePointerIdRef.current === pointerId;
  const releasePointerCapture = (element: HTMLDivElement, pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  };

  useEffect(() => () => {
    if (activePointerIdRef.current === null) return;
    activePointerIdRef.current = null;
    dragRef.current = null;
    cancelPreview();
  }, [cancelPreview]);

  return (
    <div
      role="separator"
      aria-label="AI 챗 패널 너비 조절"
      aria-orientation="vertical"
      aria-valuemin={MIN_DESKTOP_AI_CHAT_WIDTH}
      aria-valuemax={MAX_DESKTOP_AI_CHAT_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="group absolute inset-y-0 -left-[6px] z-20 flex w-[12px] cursor-col-resize touch-none items-stretch outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0 || activePointerIdRef.current !== null) return;
        dragRef.current = { startWidth: width, startX: event.clientX };
        activePointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (!isActivePointer(event.pointerId)) return;
        const nextWidth = widthForClientX(event.clientX);
        if (nextWidth !== null) previewWidth(nextWidth);
      }}
      onPointerUp={(event) => {
        if (!isActivePointer(event.pointerId)) return;
        const nextWidth = widthForClientX(event.clientX);
        activePointerIdRef.current = null;
        dragRef.current = null;
        releasePointerCapture(event.currentTarget, event.pointerId);
        if (nextWidth !== null) commitWidth(nextWidth);
      }}
      onPointerCancel={(event) => {
        if (!isActivePointer(event.pointerId)) return;
        activePointerIdRef.current = null;
        dragRef.current = null;
        releasePointerCapture(event.currentTarget, event.pointerId);
        cancelPreview();
      }}
      onLostPointerCapture={(event) => {
        if (!isActivePointer(event.pointerId)) return;
        activePointerIdRef.current = null;
        dragRef.current = null;
        cancelPreview();
      }}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : null;
        if (delta === null) return;
        const nextWidth = clampDesktopAiChatWidth(width + delta);
        if (nextWidth === null) return;
        event.preventDefault();
        commitWidth(nextWidth);
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none mx-auto h-full w-px bg-border/70 transition-colors group-hover:bg-primary group-focus-visible:bg-primary"
      />
    </div>
  );
}

function PanelBody({
  activeRightSurface,
  onClose,
}: {
  activeRightSurface: Exclude<ActiveRightSurface, null>;
  onClose(): void;
}) {
  if (activeRightSurface === 'ai_chat') {
    return <ConversationPanel onClose={onClose} />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        aria-label="알림 패널 닫기"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden="true" size={18} />
      </button>
      <AlertsPopover />
    </div>
  );
}

function useMobileAuxiliaryPanel(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return isMobile;
}

function focusLauncher(launcherRef: RefObject<HTMLElement | null>) {
  const currentLauncher = launcherRef.current;
  const launcher = currentLauncher?.isConnected
    ? currentLauncher
    : Array.from(document.querySelectorAll<HTMLElement>('[data-right-surface-launcher]')).find(
      (candidate) => candidate.dataset.rightSurfaceLauncher
        === currentLauncher?.dataset.rightSurfaceLauncher,
    ) ?? document.querySelector<HTMLElement>('[data-right-surface-launcher]');
  launcher?.focus();
}

function rightSurfaceLabel(surface: Exclude<ActiveRightSurface, null>): string {
  return surface === 'notifications' ? '알림' : 'AI 챗';
}
