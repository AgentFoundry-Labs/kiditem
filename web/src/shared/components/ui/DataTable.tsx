'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  emptyMessage?: string;
  title?: string;
  actions?: React.ReactNode;
  rowClassName?: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 10,
  searchable = false,
  searchPlaceholder = '검색...',
  onSearch,
  emptyMessage = '데이터가 없습니다.',
  title,
  actions,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const filtered = search
    ? data.filter((item) =>
        Object.values(item).some(
          (val) => typeof val === 'string' && val.toLowerCase().includes(search.toLowerCase())
        )
      )
    : data;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      {(title || searchable || actions) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2028]">
          {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
          <div className="flex items-center gap-3 ml-auto">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                    onSearch?.(e.target.value);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-48 pl-8 pr-3 py-1.5 bg-[#0d0e13] border border-[#1e2028] rounded-lg text-xs text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/30"
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1e2028]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-5 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  )}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-xs text-gray-600">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((item, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'border-b border-[#1e2028]/50 transition-colors',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-white/[0.02]',
                    rowClassName?.(item, idx)
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-3 text-xs text-gray-400 whitespace-nowrap',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {col.render ? col.render(item, page * pageSize + idx) : item[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1e2028]">
          <span className="text-[10px] text-gray-600">
            {filtered.length}건 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 text-gray-500 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              if (pageNum >= totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-7 h-7 rounded-lg text-[10px] transition-colors',
                    page === pageNum
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-600 hover:bg-white/5'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 text-gray-500 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
