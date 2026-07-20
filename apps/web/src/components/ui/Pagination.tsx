'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;   // 1-indexed
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
      <span className="text-sm text-slate-500">
        {total}건 중 {start}-{end}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="첫 페이지"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="이전 페이지"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const pageNum = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
          if (pageNum > totalPages) return null;
          return (
            <button
              type="button"
              key={pageNum}
              aria-label={`${pageNum}`}
              aria-current={page === pageNum ? 'page' : undefined}
              onClick={() => onPageChange(pageNum)}
              className={cn('w-8 h-8 rounded text-sm', page === pageNum ? 'bg-purple-600 text-white' : 'hover:bg-slate-100')}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="다음 페이지"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          aria-label="마지막 페이지"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
