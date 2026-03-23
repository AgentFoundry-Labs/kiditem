'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Clock, Zap, GitBranch, Timer, Repeat, Globe,
  ArrowRightLeft, Bell, Brain, CheckCircle, XCircle, Loader2,
} from 'lucide-react';
import { cn, getModuleColor } from '@/lib/utils';
import type { NodeType } from '@/shared/types';

const nodeTypeIcons: Record<NodeType, any> = {
  trigger: Clock,
  action: Zap,
  condition: GitBranch,
  delay: Timer,
  loop: Repeat,
  api_call: Globe,
  data_transform: ArrowRightLeft,
  notification: Bell,
  ai_process: Brain,
};

const statusConfig = {
  idle: { color: 'border-gray-700', icon: null, glow: '' },
  running: { color: 'border-blue-500', icon: Loader2, glow: 'shadow-blue-500/20 shadow-lg' },
  success: { color: 'border-emerald-500/50', icon: CheckCircle, glow: '' },
  error: { color: 'border-red-500', icon: XCircle, glow: 'shadow-red-500/20 shadow-lg' },
  disabled: { color: 'border-gray-800', icon: null, glow: '' },
};

function WorkflowNode({ data }: NodeProps) {
  const { label, nodeType, module, status, config } = data;
  const Icon = nodeTypeIcons[nodeType as NodeType] || Zap;
  const moduleColor = getModuleColor(module);
  const statusCfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const StatusIcon = statusCfg.icon;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#2a2d48] !border-[#3a3d58] !border-2"
      />

      <div
        className={cn(
          'bg-[#13151c] border-2 rounded-xl px-4 py-3 min-w-[160px] max-w-[220px] transition-all duration-300',
          statusCfg.color,
          statusCfg.glow,
          status === 'disabled' && 'opacity-40'
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
          <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">
            {nodeType === 'ai_process' ? 'AI' : nodeType?.replace('_', ' ')}
          </span>
          {StatusIcon && (
            <StatusIcon
              className={cn(
                'w-3 h-3 ml-auto flex-shrink-0',
                status === 'success' && 'text-emerald-400',
                status === 'error' && 'text-red-400',
                status === 'running' && 'text-blue-400 animate-spin'
              )}
            />
          )}
        </div>

        {/* Label */}
        <p className="text-xs font-medium text-gray-200 leading-relaxed">{label}</p>

        {/* Config hint */}
        {config?.api && (
          <p className="text-[9px] text-gray-600 mt-1 truncate">API: {config.api}</p>
        )}
        {config?.cron && (
          <p className="text-[9px] text-gray-600 mt-1 truncate">cron: {config.cron}</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#2a2d48] !border-[#3a3d58] !border-2"
      />
    </>
  );
}

export default memo(WorkflowNode);
