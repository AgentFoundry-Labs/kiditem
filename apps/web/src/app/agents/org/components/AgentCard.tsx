'use client';
import { ADAPTER_LABELS, ROLE_LABELS, type OrgNode } from '../../lib/agent-types';
import { agentStatusDot, agentStatusDotDefault } from '@/lib/status-colors';
import { cn } from '@/lib/utils';

interface Props {
  node: OrgNode;
  onClick: () => void;
}

export default function AgentCard({ node, onClick }: Props) {
  const dotClass = agentStatusDot[node.status] ?? agentStatusDotDefault;
  const initial = node.name.charAt(0).toUpperCase();
  const adapterLabel = ADAPTER_LABELS[node.adapterType] ?? node.adapterType;
  const roleLabel = ROLE_LABELS[node.role] ?? node.role;
  const hired = node.hired;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 w-36 text-left",
        hired
          ? "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
          : "border-dashed border-slate-300 bg-slate-50 opacity-60 hover:opacity-80 hover:border-violet-300",
      )}
    >
      {/* Icon + status dot */}
      <div className="relative">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
          hired
            ? "bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700"
            : "bg-slate-200 text-slate-400",
        )}>
          {initial}
        </div>
        {hired && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
            <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', dotClass)} />
          </span>
        )}
      </div>

      {/* Name */}
      <div className="w-full text-center">
        <p className={cn("text-xs font-medium truncate", hired ? "text-slate-900" : "text-slate-500")}>{node.name}</p>
        {hired && node.title && (
          <p className="text-[10px] text-slate-500 truncate mt-0.5">{node.title}</p>
        )}
        {!hired && (
          <p className="text-[10px] text-violet-500 mt-0.5">고용하기</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap justify-center gap-1">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
          {roleLabel}
        </span>
        {hired && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-purple-600">
            {adapterLabel}
          </span>
        )}
      </div>
    </button>
  );
}
