'use client';

import {
  Bot,
  Check,
  FileBox,
  Info,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ExecutionCanvasNode,
  ExecutionCanvasNodeKind,
  ExecutionCanvasStatus,
} from '../lib/execution-canvas-graph';

interface ExecutionNodeDetailProps {
  node: ExecutionCanvasNode | null;
  approvalPendingId: string | null;
  onResolveApproval: (
    approvalRequestId: string,
    status: 'approved' | 'rejected',
  ) => void;
}

export function ExecutionNodeDetail({
  node,
  approvalPendingId,
  onResolveApproval,
}: ExecutionNodeDetailProps) {
  if (!node) {
    return (
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#0c1220]">
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-4 text-center">
            <Info className="mx-auto h-5 w-5 text-slate-500" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-bold text-white">
              노드를 선택하세요
            </h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              실행 캔버스의 노드를 선택하면 상태, 식별자, compact metadata를 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const metadataEntries = Object.entries(node.metadata).filter(
    ([key, value]) => !isPromotedMetadata(node, key, value),
  );
  const approvalRequestId =
    node.kind === 'approval' ? node.metadata.approvalRequestId : undefined;
  const approvalPending = approvalPendingId === approvalRequestId;

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#0c1220] text-slate-100">
      <header className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              kindTone(node.kind),
            )}
          >
            <NodeKindIcon kind={node.kind} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                {node.kind}
              </span>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-bold',
                  statusTone(node.status),
                )}
              >
                {node.status}
              </span>
            </div>
            <h2 className="mt-2 break-words text-sm font-bold leading-5 text-white">
              {node.label}
            </h2>
            <p className="mt-1 break-all text-xs font-medium text-cyan-200/80">
              {node.eyebrow}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {node.description ? (
          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Description
            </h3>
            <p className="mt-2 break-words text-xs leading-5 text-slate-200">
              {node.description}
            </p>
          </section>
        ) : null}

        {approvalRequestId ? (
          <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
            <div className="flex gap-2">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-amber-100">
                  승인 대기
                </h3>
                <p className="mt-1 text-xs leading-5 text-amber-100/80">
                  승인 전에는 외부 제출, 주문, 결제 같은 부수 효과가 실행되지 않습니다.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onResolveApproval(approvalRequestId, 'approved')
                    }
                    disabled={approvalPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300/40 px-2.5 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    승인
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onResolveApproval(approvalRequestId, 'rejected')
                    }
                    disabled={approvalPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-300/40 px-2.5 text-xs font-semibold text-red-100 transition hover:border-red-200 hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    거절
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Node
          </h3>
          <dl className="mt-2 space-y-2">
            <DetailRow label="id" value={node.id} />
            <DetailRow label="sourceId" value={node.sourceId} />
            <DetailRow label="laneId" value={node.laneId} />
          </dl>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Metadata
          </h3>
          {metadataEntries.length > 0 ? (
            <dl className="mt-2 space-y-2">
              {metadataEntries.map(([key, value]) => (
                <DetailRow key={key} label={key} value={value} />
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              표시할 metadata가 없습니다.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-xs">
      <dt className="truncate font-semibold text-slate-500">{label}</dt>
      <dd className="break-words text-right font-medium text-slate-200">
        {value}
      </dd>
    </div>
  );
}

function isPromotedMetadata(
  node: ExecutionCanvasNode,
  key: string,
  value: string,
): boolean {
  return (
    (key === 'capabilityKey' && value === node.eyebrow) ||
    value === node.label ||
    value === node.description
  );
}

function kindTone(kind: ExecutionCanvasNodeKind): string {
  switch (kind) {
    case 'agent':
      return 'bg-cyan-300/10 text-cyan-200';
    case 'tool':
      return 'bg-indigo-300/10 text-indigo-200';
    case 'artifact':
      return 'bg-emerald-300/10 text-emerald-200';
    case 'approval':
      return 'bg-amber-300/10 text-amber-200';
    default:
      return 'bg-white/5 text-slate-300';
  }
}

function statusTone(status: ExecutionCanvasStatus): string {
  switch (status) {
    case 'running':
      return 'bg-cyan-300/10 text-cyan-200';
    case 'succeeded':
      return 'bg-emerald-300/10 text-emerald-200';
    case 'failed':
      return 'bg-red-300/10 text-red-200';
    case 'waiting_approval':
      return 'bg-amber-300/10 text-amber-200';
    case 'skipped':
      return 'bg-slate-300/10 text-slate-300';
    case 'waiting':
    default:
      return 'bg-sky-300/10 text-sky-200';
  }
}

function NodeKindIcon({ kind }: { kind: ExecutionCanvasNodeKind }) {
  switch (kind) {
    case 'agent':
      return <Bot className="h-4 w-4" aria-hidden="true" />;
    case 'tool':
      return <Wrench className="h-4 w-4" aria-hidden="true" />;
    case 'artifact':
      return <FileBox className="h-4 w-4" aria-hidden="true" />;
    case 'approval':
      return <ShieldAlert className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Info className="h-4 w-4" aria-hidden="true" />;
  }
}
