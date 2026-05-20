'use client';

import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectionAction {
  checked: boolean;
  onChange: (checked: boolean) => void;
  deleteAction?: {
    label: string;
    disabled: boolean;
    onClick: () => void;
  };
}

interface ProductInboxListFrameProps {
  isLoading: boolean;
  isEmpty: boolean;
  emptyState: {
    title: string;
    description: string;
  };
  selectionAction?: SelectionAction;
  loadingCount?: number;
  children: ReactNode;
}

export function ProductInboxListFrame({
  isLoading,
  isEmpty,
  emptyState,
  selectionAction,
  loadingCount = 6,
  children,
}: ProductInboxListFrameProps) {
  return (
    <>
      {selectionAction && (
        <div className="mb-3 flex h-7 items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={selectionAction.checked}
              onChange={(event) => selectionAction.onChange(event.currentTarget.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-xs font-medium text-slate-500">전체 선택</span>
          </label>
          {selectionAction.deleteAction && (
            <button
              type="button"
              onClick={selectionAction.deleteAction.onClick}
              disabled={selectionAction.deleteAction.disabled}
              className={cn(
                'h-7 rounded-md border px-3 text-xs font-semibold transition-colors',
                selectionAction.deleteAction.disabled
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50',
              )}
            >
              {selectionAction.deleteAction.label}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <ProductInboxGrid>
          {Array.from({ length: loadingCount }).map((_, index) => (
            <ProductInboxSkeletonCard key={index} />
          ))}
        </ProductInboxGrid>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
            <AlertCircle size={24} className="text-slate-400" />
          </div>
          <p className="mb-2 text-lg font-bold text-slate-800">{emptyState.title}</p>
          <p className="text-sm">{emptyState.description}</p>
        </div>
      ) : (
        <ProductInboxGrid>{children}</ProductInboxGrid>
      )}
    </>
  );
}

function ProductInboxGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </div>
  );
}

function ProductInboxSkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="aspect-square w-full shrink-0 bg-slate-200" />
      <div className="space-y-2 bg-slate-50 p-2.5">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="h-2 w-1/2 rounded bg-slate-100" />
        <div className="h-2 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}
