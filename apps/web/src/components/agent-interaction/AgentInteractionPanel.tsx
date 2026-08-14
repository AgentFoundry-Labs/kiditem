'use client';

import { useEffect } from 'react';
import { AgentInteractionSurface } from './AgentInteractionSurface';
import { useInteractionStore } from './interaction-store';

export function AgentInteractionPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const isOpen = useInteractionStore((state) => state.isOpen);
  const setOpen = useInteractionStore((state) => state.setOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen, setOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="AgentOS 대화"
      aria-modal="true"
      data-narrow-mode="fullscreen"
      className="fixed inset-0 z-50 flex overflow-hidden bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-xl sm:border-l sm:border-border"
    >
      <button
        type="button"
        aria-label="AgentOS 대화 닫기"
        className="absolute right-3 top-3 z-10 rounded-md px-2 py-1 text-sm text-muted-foreground"
        onClick={() => setOpen(false)}
      >
        닫기
      </button>
      <AgentInteractionSurface aria-label="AgentOS 대화 내용" />
    </div>
  );
}
