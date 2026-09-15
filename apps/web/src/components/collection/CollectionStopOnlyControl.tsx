'use client';

import type { CollectionControlView } from '@/hooks/use-collection-source-control';
import { cn } from '@/lib/utils';
import { CollectionStartControl } from './CollectionStartControl';

/**
 * A source whose own screen starts it, because the caller takes the collected
 * rows away with it. The control stays out of the way until the owner reports
 * a collection running, and then names the source, shows the running scope and
 * offers the operator stop. A notice the last stop left survives the
 * collection's end so the operator can read it.
 */
export function CollectionStopOnlyControl({
  control,
  label,
  className,
}: {
  control: CollectionControlView & Readonly<{ stop: () => void }>;
  /** What this source collects, shown beside the running state. */
  label: string;
  className?: string;
}) {
  if (control.state !== 'running' && control.state !== 'stopping' && !control.notice) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2',
        className,
      )}
    >
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <CollectionStartControl control={control} startLabel={label} onStop={control.stop} />
    </div>
  );
}
