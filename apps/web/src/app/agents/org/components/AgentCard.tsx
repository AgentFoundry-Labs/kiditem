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

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all duration-200 w-36 text-left"
    >
      {/* Icon + status dot */}
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
          {initial}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
          <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', dotClass)} />
        </span>
      </div>

      {/* Name */}
      <div className="w-full text-center">
        <p className="text-xs font-medium text-gray-900 truncate">{node.name}</p>
        {node.title && (
          <p className="text-[10px] text-gray-500 truncate mt-0.5">{node.title}</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap justify-center gap-1">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
          {roleLabel}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">
          {adapterLabel}
        </span>
      </div>
    </button>
  );
}
