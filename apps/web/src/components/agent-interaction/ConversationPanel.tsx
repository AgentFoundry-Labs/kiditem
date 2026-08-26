'use client';

import { History, Plus, Settings2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ConversationFlow } from './ConversationFlow';
import { useConversationRuntime } from './ConversationRuntimeHost';
import { conversationContextFor, conversationContexts } from './conversation-context.catalog';
import { openConversation, useConversationSurfaceState } from './conversation-surface-state';

export function ConversationPanel({ onClose }: { onClose(): void }) {
  const runtime = useConversationRuntime();
  const selectedContext = useConversationSurfaceState((state) => state.selectedContext);
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  const [newConversationMenuOpen, setNewConversationMenuOpen] = useState(false);
  const newConversationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const context = conversationContextFor(
    runtime.activeConversation?.agentKey ?? runtime.draft?.agentKey ?? selectedContext,
  );
  const title = runtime.activeConversation?.title ?? null;

  const startNewConversation = (agentKey: typeof context.key) => {
    openConversation({ fixedAgentKey: agentKey });
    setNewConversationMenuOpen(false);
  };

  return (
    <section aria-label="AI 챗" className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2
            data-right-auxiliary-heading
            tabIndex={-1}
            className="truncate text-base font-semibold outline-none"
          >
            {context.label}
          </h2>
          {title ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{title}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="relative">
            <button
              type="button"
              ref={newConversationTriggerRef}
              aria-label="새 AI 대화"
              aria-expanded={newConversationMenuOpen}
              aria-haspopup="menu"
              onClick={() => setNewConversationMenuOpen((open) => !open)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus aria-hidden="true" size={18} />
            </button>
            {newConversationMenuOpen ? (
              <div
                role="menu"
                aria-label="새 AI 대화 컨텍스트"
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setNewConversationMenuOpen(false);
                  newConversationTriggerRef.current?.focus();
                }}
                className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border bg-popover p-1 shadow-lg"
              >
                {conversationContexts.map((candidate) => (
                  <button
                    key={candidate.key ?? 'general'}
                    type="button"
                    role="menuitem"
                    onClick={() => startNewConversation(candidate.key)}
                    className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="대화 설정"
            onClick={(event) => openSettings(event.currentTarget)}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 aria-hidden="true" size={18} />
          </button>
          <Link
            href="/agent-os"
            aria-label="전체 기록"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History aria-hidden="true" size={18} />
          </Link>
          <button
            type="button"
            aria-label="AI 챗 닫기"
            onClick={onClose}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      </header>
      {runtime.conversationId ? (
        <ConversationFlow />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {context.placeholder}
        </div>
      )}
    </section>
  );
}
