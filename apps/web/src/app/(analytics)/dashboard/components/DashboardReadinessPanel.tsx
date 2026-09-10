'use client';

import { CheckCircle2, CircleAlert, Clock3, Database, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardDataBasis, type DashboardMetricBasis } from './DashboardDataBasis';
import { WingDailyTrafficCollection } from './WingDailyTrafficCollection';
import type { DashboardPeriod } from '../hooks/use-wing-traffic-collection';

export type DashboardReadinessState =
  | 'current'
  | 'stale'
  | 'unknown'
  | 'unavailable'
  | 'query-error'
  | 'partial'
  | 'loading'
  | 'error'
  | 'empty';

export type DashboardReadinessSource = {
  key: string;
  label: string;
  state: DashboardReadinessState;
  detail: string;
  coverage?: string | null;
  missingDates?: string[];
  basis?: DashboardMetricBasis | null;
};

function stateLabel(state: DashboardReadinessState): string {
  if (state === 'current') return '현재';
  if (state === 'stale') return '오래됨';
  if (state === 'unknown') return '상태 미상';
  if (state === 'unavailable') return '사용 불가';
  if (state === 'query-error') return '조회 실패';
  if (state === 'partial') return '부분';
  if (state === 'loading') return '확인 중';
  if (state === 'error') return '오류';
  return '미수집';
}

function StateIcon({ state }: { state: DashboardReadinessState }) {
  if (state === 'current') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (state === 'stale') return <CircleAlert size={14} className="text-amber-500" />;
  if (state === 'unknown') return <CircleAlert size={14} className="text-slate-400" />;
  if (state === 'unavailable') return <XCircle size={14} className="text-slate-400" />;
  if (state === 'query-error') return <XCircle size={14} className="text-rose-500" />;
  if (state === 'partial') return <CircleAlert size={14} className="text-amber-500" />;
  if (state === 'loading') return <Clock3 size={14} className="text-sky-500" />;
  if (state === 'error') return <XCircle size={14} className="text-rose-500" />;
  return <Database size={14} className="text-slate-400" />;
}

export function DashboardReadinessPanel({
  period,
  selectedFrom,
  selectedTo,
  sources,
}: {
  period: DashboardPeriod;
  selectedFrom?: string;
  selectedTo?: string;
  sources: DashboardReadinessSource[];
}) {
  return (
    <aside
      className="flex min-h-0 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm"
      data-testid="dashboard-readiness-panel"
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-slate-600" />
          <h2 className="text-sm font-bold text-slate-900">데이터 상태</h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          선택 기간의 원천별 최신성·커버리지·누락 날짜를 확인합니다.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sources.map((source) => (
          <section key={source.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <StateIcon state={source.state} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{source.label}</span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                source.state === 'current' && 'bg-emerald-50 text-emerald-700',
                source.state === 'stale' && 'bg-amber-50 text-amber-700',
                source.state === 'unknown' && 'bg-slate-100 text-slate-500',
                source.state === 'unavailable' && 'bg-slate-100 text-slate-500',
                source.state === 'query-error' && 'bg-rose-50 text-rose-700',
                source.state === 'partial' && 'bg-amber-50 text-amber-700',
                source.state === 'loading' && 'bg-sky-50 text-sky-700',
                source.state === 'error' && 'bg-rose-50 text-rose-700',
                source.state === 'empty' && 'bg-slate-100 text-slate-500',
              )}>{stateLabel(source.state)}</span>
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{source.detail}</div>
            {source.coverage && <div className="mt-1 text-[10px] text-slate-400">{source.coverage}</div>}
            {source.missingDates && source.missingDates.length > 0 && (
              <div className="mt-1 break-words text-[10px] text-amber-600">
                누락 날짜 {source.missingDates.join(', ')}
              </div>
            )}
            {source.basis && <DashboardDataBasis basis={source.basis} className="mt-1" />}
          </section>
        ))}

        <div className="border-t border-slate-100 pt-2">
          <WingDailyTrafficCollection
            period={period}
            selectedFrom={selectedFrom}
            selectedTo={selectedTo}
          />
        </div>
      </div>
    </aside>
  );
}
