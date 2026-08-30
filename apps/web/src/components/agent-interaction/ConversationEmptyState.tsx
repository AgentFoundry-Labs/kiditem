'use client';

import { Sparkles } from 'lucide-react';
import { ConversationContextMark } from './ConversationContextMark';

export interface ConversationEmptyStateProps {
  contextLabel: string;
  description: string;
  suggestions: readonly string[];
  compact?: boolean;
  onSuggestion?(message: string): void;
}

/** Shared idle state for the full history workspace and compact AI chat panel. */
export function ConversationEmptyState({
  contextLabel,
  description,
  suggestions,
  compact = false,
  onSuggestion,
}: ConversationEmptyStateProps) {
  const visibleSuggestions = suggestions.slice(0, 3);
  return (
    <section
      data-testid="conversation-empty-state"
      aria-label={`${contextLabel} 새 대화`}
      className={`mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center ${compact ? 'px-5 py-8' : 'px-4 py-16 sm:px-6'}`}
    >
      <ConversationContextMark contextLabel={contextLabel} size="lg" />
      <h2 className="mt-4 text-lg font-semibold">{contextLabel}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {onSuggestion && visibleSuggestions.length ? (
        <div aria-label="대화 제안" className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Sparkles aria-hidden="true" size={14} />
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
