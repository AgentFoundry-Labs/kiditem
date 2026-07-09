'use client';

import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AgentCommandBar({
  value,
  pending,
  onChange,
  onSubmit,
}: {
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const disabled = pending || value.trim().length === 0;

  return (
    <form
      aria-label="Agent command"
      className="flex min-h-[56px] items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
        placeholder="직원에게 요청하기"
      />
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-md border text-sm transition',
          disabled
            ? 'border-[var(--border-subtle)] text-[var(--text-disabled)]'
            : 'border-[var(--primary)] bg-[var(--primary)] text-white hover:brightness-105',
        )}
        aria-label="전송"
      >
        <SendHorizontal size={18} />
      </button>
    </form>
  );
}
