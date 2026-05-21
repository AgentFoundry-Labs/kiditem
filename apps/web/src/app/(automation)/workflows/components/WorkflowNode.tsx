'use client';

import { memo, useCallback, type ComponentType } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Clock,
  Calendar,
  GitBranch,
  Bell,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { cn, getModuleColor } from '@/lib/utils';

// Slim-core executor surface (matches server `executors/builtin.ts`).
// Unknown / legacy node types still render — they fall back to the generic
// Zap icon so old templates remain visible until they fail at run time.
const nodeTypeIcons: Record<string, ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'trigger.manual': Clock,
  'trigger.schedule': Calendar,
  'condition.evaluate': GitBranch,
  'notification.alert': Bell,
};

const nodeTypeLabels: Record<string, string> = {
  'trigger.manual': 'TRIGGER',
  'trigger.schedule': 'SCHEDULE',
  'condition.evaluate': 'CONDITION',
  'notification.alert': 'ALERT',
};

const statusConfig = {
  idle: { color: 'border-slate-300', icon: null, glow: '' },
  running: { color: 'border-blue-500', icon: Loader2, glow: 'shadow-blue-500/20 shadow-lg' },
  success: { color: 'border-emerald-500/50', icon: CheckCircle, glow: '' },
  error: { color: 'border-red-500', icon: XCircle, glow: 'shadow-red-500/20 shadow-lg' },
  disabled: { color: 'border-slate-200', icon: null, glow: '' },
};

function WorkflowNode({ data, id }: NodeProps) {
  const { label, nodeType, module, status, config, onNodeClick } = data;
  const Icon = nodeTypeIcons[nodeType as string] ?? Zap;
  const typeLabel = nodeTypeLabels[nodeType as string] ?? (nodeType as string)?.replace(/[._]/g, ' ');
  const moduleColor = getModuleColor(module);
  const statusCfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const StatusIcon = statusCfg.icon;

  const handleClick = useCallback(() => {
    if (onNodeClick) {
      onNodeClick(id);
    }
  }, [onNodeClick, id]);

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-white !border-slate-300 !border-2"
      />

      <div
        onClick={handleClick}
        className={cn(
          'bg-white border-2 rounded-xl px-4 py-3 min-w-[160px] max-w-[220px] transition-all duration-300',
          statusCfg.color,
          statusCfg.glow,
          status === 'disabled' && 'opacity-40',
          onNodeClick && 'cursor-pointer hover:shadow-md',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${moduleColor}20`, border: `1px solid ${moduleColor}40` }}
          >
            <Icon className="w-3 h-3" style={{ color: moduleColor }} />
          </div>
          <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">
            {typeLabel}
          </span>
          {StatusIcon && (
            <StatusIcon
              className={cn(
                'w-3 h-3 ml-auto flex-shrink-0',
                status === 'success' && 'text-green-600',
                status === 'error' && 'text-red-400',
                status === 'running' && 'text-purple-600 animate-spin'
              )}
            />
          )}
        </div>

        {/* Label */}
        <p className="text-xs font-medium text-slate-800 leading-relaxed">{label}</p>

        {/* Config hint */}
        {config?.cron && (
          <p className="text-[9px] text-slate-600 mt-1 truncate">cron: {config.cron}</p>
        )}
        {config?.agent_type && (
          <p className="text-[9px] text-slate-600 mt-1 truncate">agent: {config.agent_type}</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-white !border-slate-300 !border-2"
      />
    </>
  );
}

export default memo(WorkflowNode);
