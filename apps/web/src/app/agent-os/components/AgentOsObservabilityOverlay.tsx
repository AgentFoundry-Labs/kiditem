'use client';

import { Activity, ClipboardCheck, ReceiptText, ShieldCheck, X } from 'lucide-react';
import type {
  AgentApprovalRequestSummary,
  AgentAuthorizationEventSummary,
  AgentCostEventSummary,
  AgentOsLiveReadinessResponse,
  AgentRunEventSummary,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';

function formatCostMicros(costMicros: string | null | undefined): string {
  const value = Number(costMicros ?? 0);
  if (!Number.isFinite(value)) return '$0.00';
  return `$${(value / 1_000_000).toFixed(2)}`;
}

function decisionTone(decision: string): string {
  if (decision === 'allowed') return 'bg-emerald-400/10 text-emerald-200';
  if (decision === 'approval_required') return 'bg-amber-400/10 text-amber-200';
  return 'bg-red-400/10 text-red-200';
}

function approvalTone(status: string): string {
  if (status === 'approved') return 'bg-emerald-400/10 text-emerald-200';
  if (status === 'pending') return 'bg-amber-400/10 text-amber-200';
  return 'bg-red-400/10 text-red-200';
}

function runTone(status: string): string {
  if (status === 'running') return 'bg-cyan-400/10 text-cyan-200';
  if (status === 'succeeded') return 'bg-emerald-400/10 text-emerald-200';
  return 'bg-red-400/10 text-red-200';
}

function readinessTone(status: string): string {
  if (status === 'ready') return 'bg-emerald-400/10 text-emerald-200';
  if (status === 'blocked') return 'bg-red-400/10 text-red-200';
  return 'bg-amber-400/10 text-amber-200';
}

export function AgentOsObservabilityOverlay({
  open,
  onClose,
  costEvents,
  totalCostMicros,
  authorizationEvents,
  approvals,
  runs,
  runEvents,
  liveReadiness,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  costEvents: AgentCostEventSummary[];
  totalCostMicros: string;
  authorizationEvents: AgentAuthorizationEventSummary[];
  approvals: AgentApprovalRequestSummary[];
  runs: AgentRunSummary[];
  runEvents: AgentRunEventSummary[];
  liveReadiness: AgentOsLiveReadinessResponse;
  loading: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        aria-label="Agent OS Audit"
        className="flex max-h-[78vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1321]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-cyan-300" aria-hidden="true" />
            <h2 className="text-[14px] font-bold text-white">Agent OS Audit</h2>
            {loading ? (
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-400">
                loading
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="운영 감사 닫기"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.04] hover:text-white"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <section className="rounded-xl border border-white/10 bg-[#101827] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <ReceiptText size={14} aria-hidden="true" />
                Total cost
              </div>
              <div className="mt-3 text-3xl font-bold text-white">
                {formatCostMicros(totalCostMicros)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatNumber(costEvents.length)} events
              </div>

              <div className="mt-4 space-y-2">
                {costEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    비용 이벤트가 없습니다.
                  </div>
                ) : (
                  costEvents.slice(0, 8).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-white/5 bg-black/10 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-slate-200">
                          {event.model}
                        </span>
                        <span className="text-xs font-bold text-cyan-200">
                          {formatCostMicros(event.costMicros)}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {event.provider} · {formatNumber(event.inputTokens + event.outputTokens)} tokens
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#101827] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Live readiness
                </div>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] font-medium',
                    liveReadiness.allReady
                      ? 'bg-emerald-400/10 text-emerald-200'
                      : 'bg-amber-400/10 text-amber-200',
                  )}
                >
                  {liveReadiness.allReady ? 'ready' : 'blocked'}
                </span>
              </div>
              <div className="space-y-2">
                {liveReadiness.checks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    live readiness 정보가 없습니다.
                  </div>
                ) : (
                  liveReadiness.checks.map((check) => (
                    <div
                      key={check.key}
                      className="rounded-lg border border-white/5 bg-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {check.label}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                            {check.detail}
                          </div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
                            readinessTone(check.status),
                          )}
                        >
                          {check.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="min-w-0 space-y-4">
            <section className="rounded-xl border border-white/10 bg-[#101827] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Authorization history
                </div>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-500">
                  {formatNumber(authorizationEvents.length)}
                </span>
              </div>
              <div className="space-y-2">
                {authorizationEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    권한 이벤트가 없습니다.
                  </div>
                ) : (
                  authorizationEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-white/5 bg-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {event.toolKey ?? event.action}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {event.reasonCode ?? event.action} · {formatDateTime(event.createdAt)}
                          </div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
                            decisionTone(event.decision),
                          )}
                        >
                          {event.decision}
                        </span>
                      </div>
                      {event.reason ? (
                        <div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                          {event.reason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#101827] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ClipboardCheck size={14} aria-hidden="true" />
                  Approval history
                </div>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-500">
                  {formatNumber(approvals.length)}
                </span>
              </div>
              <div className="space-y-2">
                {approvals.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    승인 요청 기록이 없습니다.
                  </div>
                ) : (
                  approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className="rounded-lg border border-white/5 bg-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {approval.prompt ?? approval.reason ?? approval.reasonCode ?? approval.id}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {approval.reasonCode ?? 'approval'} · {formatDateTime(approval.decidedAt ?? approval.createdAt)}
                          </div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
                            approvalTone(approval.status),
                          )}
                        >
                          {approval.status}
                        </span>
                      </div>
                      {approval.decisionReason ? (
                        <div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                          {approval.decisionReason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#101827] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Activity size={14} aria-hidden="true" />
                  Run logs
                </div>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-500">
                  {formatNumber(runEvents.length)}
                </span>
              </div>
              {runs[0] ? (
                <div className="mb-3 rounded-lg border border-white/5 bg-black/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-100">
                        {runs[0].taskKey ?? runs[0].id}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {runs[0].model} · {formatDateTime(runs[0].startedAt)}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
                        runTone(runs[0].status),
                      )}
                    >
                      {runs[0].status}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                {runEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                    런 이벤트가 없습니다.
                  </div>
                ) : (
                  runEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-white/5 bg-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-100">
                            {event.message ?? event.type}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            #{event.seq} · {event.type} · {formatDateTime(event.createdAt)}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300">
                          {event.level}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
