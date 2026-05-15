'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRODUCT_TITLE_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}\s]+$/u;

interface CreateRegistrationWorkspaceDialogProps {
  open: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}

export function CreateRegistrationWorkspaceDialog({
  open,
  isSubmitting,
  onClose,
  onSubmit,
}: CreateRegistrationWorkspaceDialogProps) {
  const [title, setTitle] = useState('');
  const trimmedTitle = title.trim().replace(/\s+/g, ' ');
  const titleError = title && !PRODUCT_TITLE_PATTERN.test(trimmedTitle)
    ? '상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.'
    : null;
  const canSubmit = trimmedTitle.length > 0 && !titleError && !isSubmitting;

  useEffect(() => {
    if (!open) setTitle('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmedTitle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-[var(--text-primary)]">등록 상품 추가</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
              상세페이지 없이 등록 작업 공간을 만듭니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-bold text-[var(--text-secondary)]">상품명</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            autoFocus
            maxLength={160}
            placeholder="예: 키즈 컵"
            className={cn(
              'mt-2 h-10 w-full rounded-lg border bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
              titleError ? 'border-rose-300' : 'border-[var(--border)]',
            )}
          />
        </label>
        {titleError && <p className="mt-2 text-xs font-semibold text-rose-600">{titleError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            생성
          </button>
        </div>
      </form>
    </div>
  );
}
