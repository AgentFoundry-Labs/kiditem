'use client';

import Link from 'next/link';
import { List, GitBranch, RefreshCw, SlidersHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterTab, ViewMode } from '../lib/agent-types';

interface AgentToolbarProps {
  filter: FilterTab;
  setFilter: (f: FilterTab) => void;
  showTerminated: boolean;
  setShowTerminated: (v: boolean) => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onRefresh: () => void;
}

export function AgentToolbar({
  filter,
  setFilter,
  showTerminated,
  setShowTerminated,
  filtersOpen,
  setFiltersOpen,
  view,
  setView,
  onRefresh,
}: AgentToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
      {/* Filter pills */}
      <div className="flex gap-1">
        {(['all', 'active', 'paused', 'error'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors',
              filter === tab
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            )}
            onClick={() => setFilter(tab)}
          >
            {{ all: '전체', active: '활성', paused: '일시정지', error: '에러' }[tab]}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Filters dropdown */}
        <div className="relative">
          <button
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg transition-colors',
              filtersOpen || showTerminated
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
            )}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {showTerminated && (
              <span className="ml-0.5 px-1 bg-gray-900 text-white rounded text-[10px]">1</span>
            )}
          </button>
          {filtersOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-gray-50 transition-colors"
                  onClick={() => setShowTerminated(!showTerminated)}
                >
                  <span className={cn(
                    'flex items-center justify-center w-3.5 h-3.5 border rounded-sm transition-colors',
                    showTerminated ? 'bg-gray-900 border-gray-900' : 'border-gray-300',
                  )}>
                    {showTerminated && <span className="text-white text-[9px] leading-none">✓</span>}
                  </span>
                  종료된 에이전트 표시
                </button>
              </div>
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            className={cn(
              'p-1.5 transition-colors',
              view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
            )}
            onClick={() => setView('list')}
            title="리스트"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            className={cn(
              'p-1.5 transition-colors',
              view === 'org' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
            )}
            onClick={() => setView('org')}
            title="조직도"
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={onRefresh}
          className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* 마켓플레이스에서 에이전트 설치 */}
        <Link
          href="/marketplace"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">에이전트 설치</span>
        </Link>
      </div>
    </div>
  );
}
