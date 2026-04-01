'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityPaginationProps {
  totalPages: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  filteredCount: number;
  pageSize: number;
}

export function ActivityPagination({ totalPages, page, setPage, filteredCount, pageSize }: ActivityPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-6">
      <span className="text-xs text-gray-400">
        {filteredCount}건 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredCount)}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="p-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-30 text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          const start = Math.max(0, Math.min(page - 2, totalPages - 5));
          const pageNum = start + i;
          if (pageNum >= totalPages) return null;
          return (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum)}
              className={cn(
                'w-8 h-8 rounded-lg text-xs transition-colors',
                page === pageNum ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50',
              )}
            >
              {pageNum + 1}
            </button>
          );
        })}
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="p-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-30 text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
