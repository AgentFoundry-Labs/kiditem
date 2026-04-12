'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mapStepStatus } from '../lib/workflow-types';
import WorkflowCanvas from './WorkflowCanvas';
import NodeDetailPopover from './NodeDetailPopover';
import type {
  WorkflowTemplate,
  WorkflowRunWithSteps,
  StepStatusInfo,
} from '../lib/workflow-types';

interface WorkflowRunViewProps {
  template: WorkflowTemplate;
  run: WorkflowRunWithSteps;
}

const runStatusConfig: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  pending: { label: '대기중', color: 'bg-slate-100 text-slate-700', icon: Clock },
  running: {
    label: '실행중',
    color: 'bg-blue-100 text-blue-700',
    icon: Loader2,
  },
  completed: {
    label: '완료',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle,
  },
  failed: {
    label: '실패',
    color: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  return `${(diffMs / 1000).toFixed(1)}s`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function WorkflowRunView({
  template,
  run,
}: WorkflowRunViewProps) {
  const [showSteps, setShowSteps] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });

  const stepStatusMap = useMemo(() => {
    return new Map<string, StepStatusInfo>(
      run.steps.map((s) => [
        s.nodeId,
        {
          status: mapStepStatus(s.status),
          outputData: s.outputData,
          error: s.error,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        },
      ]),
    );
  }, [run.steps]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!stepStatusMap.has(nodeId)) return;
      // Position popover near center of viewport
      setPopoverPos({ x: Math.min(window.innerWidth - 360, window.innerWidth / 2), y: 120 });
      setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    },
    [stepStatusMap],
  );

  const selectedStepInfo = selectedNodeId ? stepStatusMap.get(selectedNodeId) ?? null : null;

  const cfg = runStatusConfig[run.status] ?? runStatusConfig.pending;
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-4">
      {/* Run summary */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            cfg.color,
          )}
        >
          <StatusIcon
            className={cn(
              'w-3.5 h-3.5',
              run.status === 'running' && 'animate-spin',
            )}
          />
          {cfg.label}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <User className="w-3.5 h-3.5" />
          {run.triggeredBy}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(run.startedAt)}
        </div>

        <span className="text-xs text-slate-400">
          소요 {formatDuration(run.startedAt, run.completedAt)}
        </span>

        {run.error && (
          <span className="text-xs text-red-500 truncate max-w-[300px]">
            {run.error}
          </span>
        )}
      </div>

      {/* Canvas with step overlay */}
      <div className="relative">
        <WorkflowCanvas
          template={template}
          stepStatusMap={stepStatusMap}
          onNodeClick={handleNodeClick}
        />
        {selectedStepInfo && (
          <NodeDetailPopover
            stepInfo={selectedStepInfo}
            position={popoverPos}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Step detail table (collapsible) */}
      {run.steps.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
          >
            <span>스텝 상세 ({run.steps.length})</span>
            {showSteps ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showSteps && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">노드</th>
                  <th className="text-left px-4 py-2 font-medium">상태</th>
                  <th className="text-right px-4 py-2 font-medium">소요시간</th>
                  <th className="text-left px-4 py-2 font-medium">에러</th>
                </tr>
              </thead>
              <tbody>
                {run.steps.map((step) => {
                  const frontendStatus = mapStepStatus(step.status);
                  return (
                    <tr
                      key={step.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-2 text-slate-800 font-medium">
                        {step.nodeLabel}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs',
                            frontendStatus === 'success' && 'text-green-600',
                            frontendStatus === 'error' && 'text-red-500',
                            frontendStatus === 'running' && 'text-purple-600',
                            frontendStatus === 'idle' && 'text-slate-500',
                          )}
                        >
                          {frontendStatus === 'success' && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {frontendStatus === 'error' && (
                            <XCircle className="w-3 h-3" />
                          )}
                          {frontendStatus === 'running' && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {frontendStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500 font-mono text-[11px]">
                        {formatDuration(step.startedAt, step.completedAt)}
                      </td>
                      <td className="px-4 py-2 text-red-500 text-xs truncate max-w-[200px]">
                        {step.error || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
