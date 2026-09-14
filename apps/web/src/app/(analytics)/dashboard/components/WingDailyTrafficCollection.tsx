'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatWingTrafficRange,
  useWingTrafficCollection,
  type DashboardPeriod,
} from '../hooks/use-wing-traffic-collection';

function statusLabel(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' | undefined,
  source: { ready: boolean; latestComplete: unknown } | undefined,
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
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' | undefined,
  source: { ready: boolean; latestComplete: unknown } | undefined,
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
  const attempt = collection.latestAttempt;
  const running = attempt?.state === 'RUNNING';
  const customRangeIncomplete = period === 'custom' && (!selectedFrom || !selectedTo);
  const statusUnknown = collection.source.isPending || collection.source.isError;
  const rangeMismatch = running && !collection.activeRangeMatches;
  const cancelled = attempt?.state === 'FAILED' && attempt.errorCode === 'USER_CANCELLED';
  const status = statusUnknown
    ? collection.source.isPending ? '상태 확인 중' : '상태 확인 필요'
    : statusLabel(attempt?.state, collection.source.data, cancelled);
  const actionLabel = statusUnknown
    ? status
    : collection.actionPending
      ? '수집 요청 중'
      : running
        ? rangeMismatch ? '현재 범위 확인' : '이어서 수집'
        : attempt?.state === 'FAILED'
          ? '다시 시도'
          : '일별 수집 시작';
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="wing-daily-traffic-collection"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-900">Wing 일별 트래픽</h2>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-bold',
                  statusClass(attempt?.state, collection.source.data, cancelled),
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
              {collection.source.data?.channelAccountId || collection.request?.channelAccountId
                ? ' · 연결 계정'
                : ' · 기본 계정'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Wing 트래픽 상태 새로고침"
            title="상태 새로고침"
            onClick={() => void collection.refresh()}
            disabled={collection.source.isFetching}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', collection.source.isFetching && 'animate-spin')} />
          </button>
          {running && (
            <button
              type="button"
              onClick={() => void collection.cancel()}
              disabled={collection.cancelPending || collection.actionPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 px-4 py-3 text-[13px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="wing-traffic-cancel"
            >
              {collection.cancelPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <XCircle className="h-3.5 w-3.5" />}
              {collection.cancelPending ? '중단 요청 중…' : '수집 중단'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void collection.collect()}
            disabled={collection.actionPending || collection.cancelPending || statusUnknown || !collection.rangeReady}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="wing-traffic-collect"
          >
            {collection.actionPending || (running && !rangeMismatch)
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : attempt?.state === 'COMPLETE'
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <RefreshCw className="h-3.5 w-3.5" />}
            {actionLabel}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500" aria-live="polite">
        {running && collection.activeRange ? (
          <span
            className={cn('font-semibold tabular-nums', rangeMismatch ? 'text-amber-700' : 'text-sky-700')}
            data-testid="wing-active-range"
          >
            현재 실행 범위: {formatWingTrafficRange(collection.activeRange)}
            {rangeMismatch ? ' · 선택한 범위와 달라 이어받지 않음' : ''}
          </span>
        ) : null}
        {running && (
          <span className="tabular-nums">
            진행 상태: {attempt.plan.parserVersion === 'wing-traffic-daily-v2'
              ? `${attempt.receiptCount}개 일별 데이터 확인 · 대상 ${attempt.plan.expectedDates.length}일`
              : attempt.expectedPages === null
                ? `${attempt.receiptCount} 페이지`
                : `${attempt.receiptCount}/${attempt.expectedPages} 페이지`}
          </span>
        )}
        {collection.latestComplete && (
          <span data-testid="wing-latest-complete-range">
            마지막 완료 {formatWingTrafficRange(collection.latestComplete.plan)}
          </span>
        )}
        {customRangeIncomplete && (
          <span className="text-amber-700">시작일과 종료일을 모두 입력해 주세요.</span>
        )}
      </div>

      {detailsOpen && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600" role="region">
          서버 source owner가 고정한 범위만 수집하며, 대시보드 수치는 완료된 원천 상태를 읽습니다.
          수집 중에는 기존 완료본을 유지합니다.
        </div>
      )}

      {attempt?.state === 'FAILED' && (
        <p className={cn('mt-2 text-[13px]', cancelled ? 'text-amber-700' : 'text-rose-700')} data-testid="wing-traffic-error">
          {cancelled
            ? '수집을 중단했습니다. 저장된 완료본은 유지됩니다.'
            : attempt.errorMessage ?? '최근 Wing 일별 트래픽 수집에 실패했습니다.'}
        </p>
      )}
      {collection.actionError && attempt?.state !== 'FAILED' && (
        <p className="mt-2 text-[13px] text-amber-700" data-testid="wing-traffic-action-error">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {collection.actionError}
        </p>
      )}
      {collection.extensionNotice && (
        <p className="mt-2 text-[13px] text-amber-700" data-testid="wing-traffic-extension-notice">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {collection.extensionNotice}
        </p>
      )}
      {collection.source.isError && !collection.actionError && (
        <p className="mt-2 text-[13px] text-red-600">Wing 수집 상태를 불러오지 못했습니다.</p>
      )}
    </section>
  );
}
