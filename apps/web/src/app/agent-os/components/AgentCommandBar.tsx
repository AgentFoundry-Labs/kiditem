'use client';

import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AgentCommandBar({
  targetName = null,
  value,
  pending,
  onChange,
  onSubmit,
}: {
  targetName?: string | null;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const disabled = pending || value.trim().length === 0;
  const placeholder = targetName
    ? `운영 총괄을 통해 ${targetName}에게 맡길 업무를 입력하세요`
    : '운영 총괄에게 맡길 업무를 입력하세요';

  return (
    <form
      aria-label="업무 지시"
      className="flex min-h-14 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="업무 지시 입력"
        className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
        placeholder={placeholder}
      />
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-md border text-sm transition',
          disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400'
            : 'border-purple-600 bg-purple-600 text-white hover:bg-purple-700',
        )}
        aria-label="전송"
        title="업무 전송"
      >
        <SendHorizontal size={18} />
      </button>
    </form>
  );
}
