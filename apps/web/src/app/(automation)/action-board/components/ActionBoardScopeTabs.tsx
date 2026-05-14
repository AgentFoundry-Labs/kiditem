'use client';

import { cn } from '@/lib/utils';
import {
  SCOPE_TABS,
  type Scope,
} from '../lib/action-board-columns';

interface ActionBoardScopeTabsProps {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
}

export function ActionBoardScopeTabs({
  scope,
  onScopeChange,
}: ActionBoardScopeTabsProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b bg-white">
      <span className="text-xs text-slate-500 font-medium mr-1">담당자:</span>
      <div className="flex bg-slate-100 rounded-lg p-0.5" role="tablist" aria-label="담당자 필터">
        {SCOPE_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={scope === tab.key}
            onClick={() => onScopeChange(tab.key)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-all',
              scope === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
