import Link from 'next/link';
import { GitBranch, Hash } from 'lucide-react';
import VariantStatusBadge from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/utils';
import type { AgentTask, Traceability, WorkflowRun } from '@kiditem/shared';
import {
  computeDurationMs,
  formatDurationMs,
  shortId,
  statusBadgeVariant,
} from '../../../lib/trace-utils';

interface TraceHeaderProps {
  task: AgentTask;
  workflowRun: WorkflowRun | null;
  traceability: Traceability;
}

const CREATION_PATH_LABELS: Record<Traceability['creationPath'], { label: string; cls: string }> = {
  workflow: { label: '워크플로우 실행', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  direct: { label: '단독 실행', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  unknown: { label: '경로 미상', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export function TraceHeader({ task, workflowRun, traceability }: TraceHeaderProps) {
  const durationMs = computeDurationMs(task.startedAt, task.completedAt);
  const creation = CREATION_PATH_LABELS[traceability.creationPath];

  return (
    <header className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Hash className="w-3 h-3" />
            <span className="font-mono">{shortId(task.id)}</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono">{task.agentType}</span>
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mt-1">태스크 트레이스</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <VariantStatusBadge variant={statusBadgeVariant(task.status)} dot>
            {task.status}
          </VariantStatusBadge>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${creation.cls}`}
          >
            {creation.label}
          </span>
          {!traceability.markerFound && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              marker 누락
            </span>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <MetaField label="시작" value={formatDateTime(task.startedAt)} />
        <MetaField label="종료" value={formatDateTime(task.completedAt)} />
        <MetaField label="소요 시간" value={formatDurationMs(durationMs)} />
        <MetaField label="우선순위" value={String(task.priority)} />
      </dl>

      {workflowRun ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <GitBranch className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500">연결된 워크플로우:</span>
          <Link
            href={`/workflows/runs/${workflowRun.id}`}
            className="font-mono text-violet-600 hover:underline"
          >
            {shortId(workflowRun.id)}
          </Link>
          <span className="text-slate-400">· {workflowRun.status}</span>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400">연결된 워크플로우 없음</div>
      )}
    </header>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-800 font-medium truncate">{value}</dd>
    </div>
  );
}
