'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * A keyboard-reachable ⓘ affordance that keeps supporting evidence off the
 * screen until it is asked for. The trigger is a real button so focus order,
 * Enter/Space, and Escape come from Radix rather than a hand-rolled toggle,
 * and the label is what a screen reader announces in place of the icon.
 *
 * The content scrolls inside its own box: callers pass evidence whose length
 * they do not control (missing-date lists grow with the selected range), and a
 * popover must never push the page around.
 */
/**
 * What the affordance says about the panel behind it, before it is opened.
 *
 * `neutral` makes no claim; `partial` means some window is short; `absent`
 * means nothing was measured. Colour is never the only carrier — the label a
 * screen reader announces names the state too.
 */
export type DisclosureTone = 'neutral' | 'partial' | 'absent';

const TONE_CLASS: Record<DisclosureTone, string> = {
  neutral: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
  partial: 'text-amber-600 hover:text-amber-700',
  absent: 'text-slate-400 hover:text-slate-600',
};

const TONE_LABEL: Record<DisclosureTone, string> = {
  neutral: '',
  partial: ' · 일부 기간 미수집',
  absent: ' · 미수집',
};

export function InfoDisclosure({
  label,
  tone = 'neutral',
  children,
  className,
  iconClassName,
  contentClassName,
}: {
  label: string;
  /** Shown before the popover is opened, so a header needs no status caption. */
  tone?: DisclosureTone;
  children: ReactNode;
  /** Trigger box. Callers that need a larger hit target resize it here. */
  className?: string;
  iconClassName?: string;
  /** Content box. Callers holding a table widen it here. */
  contentClassName?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${label} 안내${TONE_LABEL[tone]}`}
          title={`${label} 안내${TONE_LABEL[tone]}`}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            TONE_CLASS[tone],
            'transition-colors hover:bg-[var(--surface-sunken)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
            className,
          )}
        >
          <Info className={cn('h-3.5 w-3.5', iconClassName)} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="note"
          side="bottom"
          align="start"
          sideOffset={6}
          className={cn(
            'z-[120] max-h-[min(18rem,60vh)] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto',
            'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3',
            'text-[11px] font-normal leading-relaxed text-[var(--text-secondary)]',
            'shadow-[var(--shadow-md)] outline-none',
            contentClassName,
          )}
          style={{ overflowWrap: 'anywhere' }}
        >
          {children}
          <Popover.Arrow className="fill-[var(--surface-raised)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
