'use client';

import { useState } from 'react';
import {
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { cn, getModuleColor, timeAgo } from '@/lib/utils';
import { workflowApi } from '../lib/workflow-api';
import type {
  WorkflowTemplate,
  WorkflowRun,
  WorkflowRunWithSteps,
} from '../lib/workflow-types';
import type { Workflow } from '@/types';
import WorkflowCanvas from './WorkflowCanvas';
import WorkflowRunView from './WorkflowRunView';

/** Convert legacy Workflow to WorkflowTemplate shape */
function legacyToTemplate(wf: Workflow): WorkflowTemplate {
  return {
    id: wf.id,
    companyId: null,
    name: wf.name,
    description: wf.description,
    module: wf.module,
    isActive: wf.isActive,
    triggerType: 'manual',
    schedule: wf.schedule ?? null,
    nodesJson: wf.nodes,
    edgesJson: wf.edges,
    version: null,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  };
}

interface WorkflowListProps {
  templates?: WorkflowTemplate[];
  /** @deprecated Use templates instead */
  workflows?: Workflow[];
  showModule?: boolean;
  onToggleActive?: (id: string, isActive: boolean) => void;
  onDelete?: (id: string) => void;
}

const runStatusIcons: Record<string, any> = {
  completed: CheckCircle,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
};

const runStatusLabels: Record<string, string> = {
  completed: '성공',
  failed: '오류',
  running: '실행중',
  pending: '대기',
};

const runStatusColors: Record<string, string> = {
  completed: 'text-green-600',
  failed: 'text-red-500',
  running: 'text-purple-600',
  pending: 'text-slate-500',
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  return `${(diffMs / 1000).toFixed(1)}s`;
}

export default function WorkflowList({
  templates: propTemplates,
  workflows: legacyWorkflows,
  showModule = true,
  onToggleActive,
  onDelete,
}: WorkflowListProps) {
  const templates = propTemplates ?? legacyWorkflows?.map(legacyToTemplate) ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runsMap, setRunsMap] = useState<Record<string, WorkflowRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunWithSteps | null>(
    null,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function handleExpand(wfId: string) {
    if (expandedId === wfId) {
      setExpandedId(null);
      setSelectedRun(null);
      setSelectedTemplateId(null);
      return;
    }

    setExpandedId(wfId);
    setSelectedRun(null);
    setSelectedTemplateId(null);

    if (!runsMap[wfId]) {
      setLoadingRuns(wfId);
      try {
        const runs = await workflowApi.getRuns(wfId);
        setRunsMap((prev) => ({ ...prev, [wfId]: runs }));
      } catch {
        setRunsMap((prev) => ({ ...prev, [wfId]: [] }));
      } finally {
        setLoadingRuns(null);
      }
    }
  }

  async function handleSelectRun(templateId: string, runId: string) {
    setLoadingDetail(true);
    try {
      const detail = await workflowApi.getRunDetail(runId);
      setSelectedRun(detail);
      setSelectedTemplateId(templateId);
    } catch {
      setSelectedRun(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleBackToTemplate() {
    setSelectedRun(null);
    setSelectedTemplateId(null);
  }

  return (
    <div className="space-y-3">
      {templates.map((wf) => {
        const isExpanded = expandedId === wf.id;
        const color = getModuleColor(wf.module);
        const runs = runsMap[wf.id] ?? [];
        const lastRun = runs[0];
        const lastStatus = lastRun?.status;
        const StatusIcon = lastStatus ? runStatusIcons[lastStatus] : null;

        return (
          <div key={wf.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Header row */}
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => handleExpand(wf.id)}
            >
              {/* Active indicator / toggle */}
              {onToggleActive ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(wf.id, !wf.isActive);
                  }}
                  className={cn(
                    'w-1.5 h-10 rounded-full flex-shrink-0 transition-colors cursor-pointer',
                    wf.isActive ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400',
                  )}
                  title={wf.isActive ? '비활성화' : '활성화'}
                />
              ) : (
                <div
                  className={cn(
                    'w-1.5 h-10 rounded-full flex-shrink-0 transition-colors',
                    wf.isActive ? 'bg-emerald-500' : 'bg-slate-300',
                  )}
                />
              )}

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
                  <h3 className="text-sm font-medium text-slate-900 truncate">
                    {wf.name}
                  </h3>
                  {wf.schedule && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" />
                      스케줄
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 truncate mt-0.5">
                  {wf.description}
                </p>
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 flex-shrink-0">
                {lastStatus && StatusIcon && (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      className={cn(
                        'w-3.5 h-3.5',
                        runStatusColors[lastStatus],
                        lastStatus === 'running' && 'animate-spin',
                      )}
                    />
                    <span
                      className={cn('text-[10px]', runStatusColors[lastStatus])}
                    >
                      {runStatusLabels[lastStatus]}
                    </span>
                  </div>
                )}

                {lastRun?.startedAt && (
                  <span className="text-[10px] text-slate-600 w-16 text-right">
                    {timeAgo(lastRun.startedAt)}
                  </span>
                )}

                {/* Delete */}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('이 워크플로우를 삭제하시겠습니까?')) {
                        onDelete(wf.id);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Expand */}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                )}
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-slate-200 p-4 space-y-4">
                {/* Run history bar */}
                {loadingRuns === wf.id ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    실행 이력 로딩...
                  </div>
                ) : runs.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        실행 이력
                      </h4>
                      {selectedRun && (
                        <button
                          onClick={handleBackToTemplate}
                          className="flex items-center gap-1 text-xs text-purple-600 hover:text-blue-700"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          템플릿 보기
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {runs.slice(0, 10).map((r) => {
                        const Icon = runStatusIcons[r.status] ?? Clock;
                        const isSelected = selectedRun?.id === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => handleSelectRun(wf.id, r.id)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors whitespace-nowrap',
                              isSelected
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                            )}
                          >
                            <Icon
                              className={cn(
                                'w-3 h-3',
                                runStatusColors[r.status],
                                r.status === 'running' && 'animate-spin',
                              )}
                            />
                            <span>{r.startedAt ? timeAgo(r.startedAt) : '대기'}</span>
                            <span className="text-slate-400">
                              {formatDuration(r.startedAt, r.completedAt)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">실행 이력이 없습니다.</p>
                )}

                {/* Canvas or RunView */}
                {loadingDetail ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  </div>
                ) : selectedRun && selectedTemplateId === wf.id ? (
                  <WorkflowRunView template={wf} run={selectedRun} />
                ) : (
                  <WorkflowCanvas template={wf} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
