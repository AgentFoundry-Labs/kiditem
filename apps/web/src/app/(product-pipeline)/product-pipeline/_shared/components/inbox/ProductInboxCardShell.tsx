'use client';

import type { ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeleteAction {
  isDeleting: boolean;
  onDelete: () => void;
  title: string;
}

interface HoverAction {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface SelectionAction {
  checked: boolean;
  ariaLabel: string;
  onChange: (selected: boolean) => void;
}

interface ProductInboxCardShellProps {
  title: string;
  thumbnailUrl: string | null;
  clickArea?: 'card' | 'thumbnail';
  disabled?: boolean;
  highlighted?: boolean;
  imageFallback?: string;
  meta?: ReactNode;
  statusBanner?: ReactNode;
  selectionAction?: SelectionAction;
  thumbnailTopLeft?: ReactNode;
  deleteAction?: DeleteAction;
  hoverAction?: HoverAction;
  footer?: ReactNode;
  children?: ReactNode;
  onOpen?: () => void;
}

export function ProductInboxCardShell({
  title,
  thumbnailUrl,
  clickArea = 'thumbnail',
  disabled = false,
  highlighted = false,
  imageFallback = 'No Image',
  meta,
  statusBanner,
  selectionAction,
  thumbnailTopLeft,
  deleteAction,
  hoverAction,
  footer,
  children,
  onOpen,
}: ProductInboxCardShellProps) {
  const cardOpens = clickArea === 'card' && !!onOpen;
  const thumbnailOpens = clickArea === 'thumbnail' && !!onOpen;

  return (
    <article
      onClick={cardOpens ? onOpen : undefined}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
        cardOpens && 'cursor-pointer',
        disabled && 'pointer-events-none opacity-50',
        highlighted && 'ring-2 ring-violet-400 ring-offset-1',
      )}
    >
      {statusBanner}

      <div
        className={cn(
          'relative aspect-square w-full shrink-0 overflow-hidden bg-[var(--surface-sunken)]',
          thumbnailOpens && 'cursor-pointer',
        )}
        onClick={thumbnailOpens ? onOpen : undefined}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--text-muted)]">
            {imageFallback}
          </div>
        )}

        {(selectionAction || thumbnailTopLeft || deleteAction) && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
            <div className="flex min-w-0 max-w-[calc(100%-42px)] flex-col items-start gap-1">
              {selectionAction && (
                <label
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/50 bg-white/90 shadow-sm backdrop-blur-sm"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectionAction.checked}
                    onChange={(event) => selectionAction.onChange(event.currentTarget.checked)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-emerald-500"
                    aria-label={selectionAction.ariaLabel}
                  />
                </label>
              )}
              {thumbnailTopLeft}
            </div>
            {deleteAction && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteAction.onDelete();
                }}
                disabled={deleteAction.isDeleting}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/90 text-rose-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                title={deleteAction.title}
              >
                {deleteAction.isDeleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            )}
          </div>
        )}

        {hoverAction && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2 pb-2 pt-12 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hoverAction.onClick();
              }}
              className={cn(
                'flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/95 text-[11px] font-extrabold text-emerald-700 shadow-lg backdrop-blur-sm transition-colors hover:bg-emerald-50',
                hoverAction.className,
              )}
            >
              {hoverAction.icon}
              {hoverAction.label}
            </button>
          </div>
        )}
      </div>

      <div className="bg-[var(--surface)] p-3">
        <h3
          className={cn(
            'line-clamp-2 min-h-[32px] text-xs font-bold leading-4 text-[var(--text-primary)]',
            (meta || footer) && 'mb-2',
          )}
          title={title}
        >
          {title}
        </h3>
        {meta && <div className={footer ? 'mb-3' : undefined}>{meta}</div>}
        {footer}
      </div>
      {children}
    </article>
  );
}
