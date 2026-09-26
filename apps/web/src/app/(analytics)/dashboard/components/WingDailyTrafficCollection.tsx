'use client';

import { useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { cn } from '@/lib/utils';
import {
  useWingTrafficCollection,
  type DashboardPeriod,
} from '../hooks/use-wing-traffic-collection';
import { formatWingTrafficRange, wingTrafficConfirmedDays, wingTrafficReady } from '../lib/wing-traffic-collection';
import { attemptFailureText } from '@/lib/operator-error';

type RunState = 'RUNNING' | 'COMPLETE' | 'FAILED' | undefined;
type SourceState = { ready: boolean; latestComplete: unknown } | undefined;

function statusLabel(
  state: RunState,
  source: SourceState,
  cancelled = false,
): string {
  if (state === 'RUNNING') return '수집 중';
  if (cancelled) return '수집 중단됨';
  if (state === 'FAILED') return '최근 수집 실패';
  if (state === 'COMPLETE' && source?.ready) return '최신 수집 완료';
  if (state === 'COMPLETE') return '수집 완료 · 보완 가능';
  if (source?.latestComplete) return '이전 완료본 사용 중';
  return '수집 전';
}

function statusClass(
  state: RunState,
  source: SourceState,
  cancelled = false,
): string {
  if (state === 'RUNNING') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (cancelled) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (state === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (state === 'COMPLETE' && source?.ready) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (source?.latestComplete) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

export function WingDailyTrafficCollection({
  period,
  selectedFrom,
  selectedTo,
}: {
  period: DashboardPeriod;
  selectedFrom?: string;
  selectedTo?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const collection = useWingTrafficCollection({ period, selectedFrom, selectedTo });
  const { control } = collection;
  const latest = collection.latest?.operation ?? null;
  const state: RunState = !latest
    ? undefined
    : latest.status === 'executing' || latest.status === 'prepared'
      ? 'RUNNING'
      : latest.status === 'succeeded' ? 'COMPLETE' : 'FAILED';
  const running = collection.running !== null;
  const source: SourceState = control.status
    ? { ready: wingTrafficReady(control.status), latestComplete: collection.latestComplete }
    : undefined;
  const statusUnknown = control.statusRead === 'loading' || control.statusRead === 'unavailable';
  const rangeMismatch = running && !collection.activeRangeMatches;
  const cancelled = latest?.status === 'cancelled';
  const status = statusUnknown
    ? control.statusRead === 'loading' ? '상태 확인 중' : '상태 확인 필요'
    : statusLabel(state, source, cancelled);
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="wing-daily-traffic-collection"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-900">Wing 일별 트래픽</h2>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-bold',
                  statusClass(state, source, cancelled),
                )}
              >
                {status}
              </span>
              <button
                type="button"
                aria-label="Wing 일별 트래픽 안내"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((value) => !value)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                title="Wing 일별 트래픽 안내"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              {collection.range
                ? formatWingTrafficRange(collection.range)
                : !statusUnknown && period === 'month'
                  ? '이번 달에 마감된 영업일이 없습니다'
                  : '수집 기간 확인 중'}
              {collection.range?.source === 'selected-custom-range' ? ' · 선택한 기간' : ' · KST 기준'}
              {control.status?.channelAccountId ? ' · 연결 계정' : ' · 기본 계정'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-1.5">
          <button
            type="button"
            aria-label="Wing 트래픽 상태 새로고침"
            title="상태 새로고침"
            onClick={() => void control.query.refetch()}
            disabled={control.query.isFetching}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', control.query.isFetching && 'animate-spin')} />
          </button>
          <CollectionStartControl
            control={control}
            startLabel="일별 수집 시작"
            onStart={collection.collect}
            onStop={control.stop}
            startBlockedReason={collection.startBlockedReason}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500" aria-live="polite">
        {running && collection.activeRange ? (
          <span
            className={cn('font-semibold tabular-nums', rangeMismatch ? 'text-amber-700' : 'text-sky-700')}
            data-testid="wing-active-range"
          >
            현재 실행 범위: {formatWingTrafficRange(collection.activeRange)}
            {rangeMismatch ? ' · 선택한 범위와 다름' : ''}
          </span>
        ) : null}
        {collection.running && (
          <span className="tabular-nums">
            진행 상태: {`${wingTrafficConfirmedDays(collection.running.operation)}일 확인 · 대상 ${collection.running.expectedDays}일`}
          </span>
        )}
        {collection.latestComplete && (
          <span data-testid="wing-latest-complete-range">
            마지막 완료 {formatWingTrafficRange(collection.latestComplete.range)}
          </span>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600" role="region">
          서버가 고정한 범위만 수집하며(쿠팡이 아직 공개하지 않은 뒷날은 다음 수집으로 미룹니다), 대시보드 수치는
          완료된 수집만 읽습니다. 수집 중에는 기존 완료본을 유지합니다.
        </div>
      )}

      {latest && state === 'FAILED' && (
        <p className={cn('mt-2 text-[13px]', cancelled ? 'text-amber-700' : 'text-rose-700')} data-testid="wing-traffic-error">
          {cancelled
            ? COLLECTION_STOPPED_MESSAGE
            : attemptFailureText(latest, 'coupang_wing_traffic') ?? '최근 Wing 일별 트래픽 수집에 실패했습니다.'}
        </p>
      )}
    </section>
  );
}
