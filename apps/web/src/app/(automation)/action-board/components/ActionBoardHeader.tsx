'use client';

import { ClipboardList, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  VIEW_TABS,
  type ViewMode,
} from '../lib/action-board-columns';

interface ActionBoardHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  taskCount: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function ActionBoardHeader({
  viewMode,
  onViewModeChange,
  taskCount,
  onRefresh,
  isRefreshing = false,
}: ActionBoardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-slate-600" />
        <h1 className="text-lg font-semibold text-slate-900">액션 보드</h1>
        <span className="text-xs text-slate-400 ml-1">{taskCount}건</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex bg-slate-100 rounded-lg p-0.5" role="tablist">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={viewMode === tab.key}
              onClick={() => onViewModeChange(tab.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                viewMode === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          aria-label="새로고침"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : undefined} />
        </button>
      </div>
    </div>
  );
}
