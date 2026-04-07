'use client';

import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { agentStatusDot, agentStatusDotDefault } from '@/lib/status-colors';
import { relativeTime, formatCost } from '../lib/agent-utils';
import { ADAPTER_LABELS, ROLE_LABELS } from '../lib/agent-types';
import type { Agent, OrgNode } from '../lib/agent-types';

export function OrgTreeNode({
  node,
  depth,
  agentMap,
  onNavigate,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  onNavigate: (id: string) => void;
}) {
  const agent = agentMap.get(node.id);
  const dotClass = agentStatusDot[node.status] ?? agentStatusDotDefault;
  const isLive = node.status === 'running';

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
        onClick={() => onNavigate(node.id)}
      >
        {/* Status dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={cn('absolute inline-flex h-full w-full rounded-full', dotClass)} />
        </span>

        {/* Agent icon */}
        <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0 text-xs font-semibold text-slate-500">
          {node.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-900">{node.name}</span>
          <span className="text-xs text-slate-500 ml-2">
            {ROLE_LABELS[node.role] ?? node.role}
            {node.title ? ` · ${node.title}` : ''}
          </span>
        </div>

        {/* Trailing info */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {isLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-purple-600 text-[11px] font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              Live
            </span>
          )}
          {agent?.runtimeState && agent.runtimeState.totalCostCents > 0 && (
            <span className="text-xs text-slate-400 font-mono text-right">
              {formatCost(agent.runtimeState.totalCostCents)}
            </span>
          )}
          {agent && (
            <span className="text-xs text-slate-400 font-mono w-14 text-right">
              {ADAPTER_LABELS[agent.adapterType] ?? agent.adapterType}
            </span>
          )}
          <span className="text-xs text-slate-400 w-16 text-right">
            {relativeTime(node.lastHeartbeatAt)}
          </span>
          <span className="w-20 flex justify-end">
            <StatusBadge status={node.status} />
          </span>
        </div>
        <div className="flex sm:hidden">
          <StatusBadge status={node.status} />
        </div>
      </div>

      {/* Children with border-left connector */}
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-slate-200 ml-8">
          {node.reports.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              agentMap={agentMap}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
