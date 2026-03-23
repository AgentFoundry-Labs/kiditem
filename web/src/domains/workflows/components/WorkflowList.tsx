'use client';

import { useState } from 'react';
import {
  Play, Pause, Clock, CheckCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, MoreHorizontal,
} from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import { cn, getModuleColor, timeAgo } from '@/lib/utils';
import type { Workflow } from '@/shared/types';
import WorkflowCanvas from './WorkflowCanvas';

interface WorkflowListProps {
  workflows?: Workflow[];
  showModule?: boolean;
}

const statusIcons = {
  success: CheckCircle,
  error: XCircle,
  running: Loader2,
};

const statusLabels = {
  success: '성공',
  error: '오류',
  running: '실행중',
};

export default function WorkflowList({ workflows: propWorkflows, showModule = true }: WorkflowListProps) {
  const { workflows: storeWorkflows, toggleWorkflow } = useStore();
  const workflows = propWorkflows || storeWorkflows;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {workflows.map((wf) => {
        const isExpanded = expandedId === wf.id;
        const color = getModuleColor(wf.module);
        const StatusIcon = wf.lastStatus ? statusIcons[wf.lastStatus] : null;

        return (
          <div key={wf.id} className="glass-card overflow-hidden">
            {/* Header row */}
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.01] transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : wf.id)}
            >
              {/* Active indicator */}
              <div
                className={cn(
                  'w-1.5 h-10 rounded-full flex-shrink-0 transition-colors',
                  wf.isActive ? 'bg-emerald-500' : 'bg-gray-700'
                )}
              />

              {/* Module color dot */}
              {showModule && (
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white truncate">{wf.name}</h3>
                  {wf.schedule && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" />
                      스케줄
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 truncate mt-0.5">{wf.description}</p>
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 flex-shrink-0">
                {wf.lastStatus && StatusIcon && (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      className={cn(
                        'w-3.5 h-3.5',
                        wf.lastStatus === 'success' && 'text-emerald-400',
                        wf.lastStatus === 'error' && 'text-red-400',
                        wf.lastStatus === 'running' && 'text-blue-400 animate-spin'
                      )}
                    />
                    <span className={cn(
                      'text-[10px]',
                      wf.lastStatus === 'success' && 'text-emerald-400',
                      wf.lastStatus === 'error' && 'text-red-400',
                      wf.lastStatus === 'running' && 'text-blue-400'
                    )}>
                      {statusLabels[wf.lastStatus]}
                    </span>
                  </div>
                )}

                {wf.lastRun && (
                  <span className="text-[10px] text-gray-600 w-16 text-right">
                    {timeAgo(wf.lastRun)}
                  </span>
                )}

                {/* Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWorkflow(wf.id);
                  }}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    wf.isActive
                      ? 'text-emerald-400 hover:bg-emerald-400/10'
                      : 'text-gray-600 hover:bg-gray-600/10'
                  )}
                >
                  {wf.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* Expand */}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </div>
            </div>

            {/* Expanded content - Workflow Canvas */}
            {isExpanded && (
              <div className="border-t border-[#1e2028] p-4">
                <WorkflowCanvas workflow={wf} />

                {/* Node details */}
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {wf.nodes.map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d0e13] border border-[#1a1d26]"
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          node.status === 'success' && 'bg-emerald-500',
                          node.status === 'error' && 'bg-red-500',
                          node.status === 'running' && 'bg-blue-500 pulse-dot',
                          node.status === 'idle' && 'bg-gray-600',
                          node.status === 'disabled' && 'bg-gray-800'
                        )}
                      />
                      <span className="text-[10px] text-gray-400 truncate">{node.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
