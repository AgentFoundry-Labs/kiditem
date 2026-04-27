'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  isLoading?: boolean;
}

/**
 * 공용 확인 다이얼로그 — window.confirm 대체.
 * Radix Dialog 기반, dark-mode 자동 반영, Esc / 외부 클릭으로 닫힘.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  tone = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => (isLoading ? null : onOpenChange(v))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--surface,white)] shadow-2xl border border-[var(--border,#e5e7eb)] p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onEscapeKeyDown={(e) => {
            if (isLoading) e.preventDefault();
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                tone === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600',
              )}
            >
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[15px] font-bold text-[var(--text-primary,#0f172a)] leading-snug">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description asChild>
                  <div className="mt-1.5 text-[13px] text-[var(--text-secondary,#475569)] leading-relaxed break-all">
                    {description}
                  </div>
                </Dialog.Description>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary,#475569)] hover:bg-[var(--surface-sunken,#f1f5f9)] disabled:opacity-50 transition-colors"
              >
                {cancelText}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2',
                tone === 'danger'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-[#7048e8] hover:bg-[#5f3dc4]',
              )}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
