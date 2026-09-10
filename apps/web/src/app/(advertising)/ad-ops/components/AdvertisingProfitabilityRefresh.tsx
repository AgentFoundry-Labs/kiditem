'use client';

import { Megaphone, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useAdvertisingProfitabilityRefresh } from '../hooks/useAdvertisingProfitabilityRefresh';

function statusText(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' | undefined,
  sourceStatus: 'READY' | 'STALE' | 'MISSING' | undefined,
): string {
  if (state === 'RUNNING') return '수집 중';
  if (state === 'FAILED') return '최근 수집 실패';
  if (state === 'COMPLETE' && sourceStatus === 'READY') return '최신 수집 완료';
  if (state === 'COMPLETE') return '완료 · 보완 필요';
  if (sourceStatus === 'STALE') return '이전 완료본 사용 중';
  return '수집 전';
}

export default function AdvertisingProfitabilityRefresh() {
  const { source, starting, actionError, start } = useAdvertisingProfitabilityRefresh();
  const attempt = source.data?.latestAttempt;
  const latestComplete = source.data?.latestComplete;
  const running = attempt?.state === 'RUNNING';
  const statusUnknown = source.isPending || source.isError;
  const label = statusUnknown
    ? source.isPending ? '상태 확인 중' : '상태 확인 필요'
    : statusText(attempt?.state, source.data?.status);

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-subtle)',
      }}
      data-testid="advertising-profitability-refresh"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Megaphone size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              상품별 광고비 보고서
            </h2>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: running ? 'var(--primary-soft)' : 'var(--surface-sunken)',
                color: running ? 'var(--primary)' : 'var(--text-tertiary)',
              }}
            >
              {label}
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            승인된 브라우저 세션에서 KST 어제까지 광고비를 수집합니다. ABC 평가는 별도로 실행됩니다.
          </p>
          <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }} aria-live="polite">
            {attempt?.state === 'RUNNING' && <p>브라우저에서 상품별 보고서를 수집하고 있습니다.</p>}
            {attempt?.state === 'FAILED' && (
              <p style={{ color: 'var(--danger)' }}>
                {attempt.errorMessage ?? '최근 수집에 실패했습니다.'}
              </p>
            )}
            {latestComplete && (
              <p>
                마지막 완료 기준일:{' '}
                <span className="font-semibold tabular-nums">{latestComplete.coveredThrough}</span>
                {' · '}
                {formatDateTime(latestComplete.capturedAt)}
              </p>
            )}
            {actionError && attempt?.state !== 'FAILED' && (
              <p style={{ color: 'var(--warning)' }}>{actionError}</p>
            )}
            {source.isError && !actionError && (
              <p style={{ color: 'var(--danger)' }}>수집 상태를 불러오지 못했습니다.</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting || running || statusUnknown}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--primary)', color: '#ffffff' }}
        >
          <RefreshCw size={13} className={starting || running ? 'animate-spin' : undefined} />
          {running
            ? '수집 중'
            : source.isPending
              ? '상태 확인 중'
              : source.isError
                ? '상태 확인 필요'
                : starting
                  ? '수집 시작 중'
                  : '상품별 광고비 보고서 수집'}
        </button>
      </div>
    </section>
  );
}
