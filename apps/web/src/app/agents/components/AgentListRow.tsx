'use client';

import { Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { agentStatusDot, agentStatusDotDefault } from '@/lib/status-colors';
import { relativeTime, formatCost } from '../lib/agent-utils';
import { ADAPTER_LABELS, ROLE_LABELS } from '../lib/agent-types';
import type { Agent } from '../lib/agent-types';

export function AgentListRow({ agent, onClick, onDelete, onRun, isRunning }: { agent: Agent; onClick: () => void; onDelete?: (id: string) => void; onRun?: (id: string) => void; isRunning?: boolean }) {
  const dotClass = agentStatusDot[agent.status] ?? agentStatusDotDefault;
  const isLive = agent.status === 'running';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
      onClick={onClick}
    >
      {/* Status dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={cn('absolute inline-flex h-full w-full rounded-full', dotClass)} />
      </span>

      {/* Icon placeholder */}
      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-500">
        {agent.icon ?? agent.name.charAt(0).toUpperCase()}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{agent.name}</span>
        <span className="hidden sm:inline text-xs text-gray-500 ml-2">
          {ROLE_LABELS[agent.role] ?? agent.role}
          {agent.title ? ` · ${agent.title}` : ''}
        </span>
        {agent.description && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{agent.description}</p>
        )}
      </div>

      {/* Trailing info */}
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        {isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-medium">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            Live
          </span>
        )}
        {agent.runtimeState && agent.runtimeState.totalCostCents > 0 && (
          <span className="text-xs text-gray-400 font-mono text-right">
            {formatCost(agent.runtimeState.totalCostCents)}
          </span>
        )}
        <span className="text-xs text-gray-400 font-mono w-14 text-right">
          {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
        </span>
        <span className="text-xs text-gray-400 w-16 text-right">
          {relativeTime(agent.lastHeartbeatAt)}
        </span>
        <span className="w-20 flex justify-end">
          <StatusBadge status={agent.status} />
        </span>
        {onRun && agent.status !== 'paused' && agent.status !== 'disabled' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRun(agent.id);
            }}
            disabled={isRunning}
            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="실행"
          >
            <Play className="w-3 h-3 inline -mt-0.5 mr-0.5" />
            {isRunning ? '실행 중...' : '실행'}
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('이 에이전트를 삭제하시겠습니까?')) {
                onDelete(agent.id);
              }
            }}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
