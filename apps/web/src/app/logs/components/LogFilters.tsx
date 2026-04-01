'use client';

import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModuleCategory } from '@/types';

interface Props {
  moduleFilter: ModuleCategory | 'all';
  statusFilter: string;
  onModuleFilter: (m: ModuleCategory | 'all') => void;
  onStatusFilter: (s: string) => void;
}

export function LogFilters({ moduleFilter, statusFilter, onModuleFilter, onStatusFilter }: Props) {
  return (
    <div className="flex items-center gap-4">
      <Filter className="w-4 h-4 text-gray-600" />
      <div className="flex gap-1">
        {(['all', 'order', 'accounting', 'inventory', 'cs', 'report'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModuleFilter(m)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs transition-colors border',
              moduleFilter === m
                ? 'bg-white text-gray-900 border-gray-200'
                : 'text-gray-600 hover:text-gray-500 border-transparent',
            )}
          >
            {m === 'all' ? '전체' : m}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-gray-200" />
      <div className="flex gap-1">
        {['all', 'success', 'error', 'running'].map((s) => (
          <button
            key={s}
            onClick={() => onStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs transition-colors border',
              statusFilter === s
                ? 'bg-white text-gray-900 border-gray-200'
                : 'text-gray-600 hover:text-gray-500 border-transparent',
            )}
          >
            {s === 'all' ? '전체' : s === 'success' ? '성공' : s === 'error' ? '오류' : '실행중'}
          </button>
        ))}
      </div>
    </div>
  );
}
