'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ConversationPanel } from '@/components/agent-interaction/ConversationPanel';
import { NotificationPanelContent } from '@/components/panel/NotificationPanelContent';
import type { ActiveRightSurface } from '@/store/useStore';

interface RightAuxiliaryPanelProps {
  activeRightSurface: ActiveRightSurface;
  onClose(): void;
  launcherRef: RefObject<HTMLElement | null>;
}

export function RightAuxiliaryPanel({
  activeRightSurface,
  onClose,
  launcherRef,
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

  return <PanelFrame ref={panelRef}>{content}</PanelFrame>;
}

const PanelFrame = forwardRef<HTMLElement, {
  children: ReactNode;
  mobile?: boolean;
}>(function PanelFrame({ children, mobile = false }, ref) {
  return (
    <section
      ref={ref}
      data-testid="right-auxiliary-panel"
      role={mobile ? 'dialog' : 'complementary'}
      aria-label="오른쪽 보조 패널"
      className={mobile
        ? 'fixed inset-0 z-[100] flex w-full max-w-none flex-col bg-background shadow-xl outline-none'
        : 'fixed inset-y-0 right-0 z-[90] flex w-[420px] max-w-full flex-col border-l bg-background shadow-xl'}
    >
      {children}
    </section>
  );
});

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
      <NotificationPanelContent />
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
