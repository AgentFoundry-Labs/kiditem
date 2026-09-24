'use client';

import { Megaphone } from 'lucide-react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE, stoppedAttempt } from '@/lib/collection-source-status-query';
import { formatDateTime } from '@/lib/utils';
import {
  advertisingProfitabilityCollection,
  type AdvertisingProfitabilitySourceView,
} from '../lib/advertising-profitability-collection';
import { attemptFailureText } from '@/lib/operator-error';

type ProfitabilityAttempt = NonNullable<AdvertisingProfitabilitySourceView['latestAttempt']>;

function statusText(
  attempt: ProfitabilityAttempt | null | undefined,
  source: AdvertisingProfitabilitySourceView | undefined,
): string {
  if (attempt?.state === 'RUNNING') return '수집 중';
  if (attempt?.state === 'FAILED') {
    return stoppedAttempt(attempt) ? '수집 중단됨' : '최근 수집 실패';
  }
  if (attempt?.state === 'COMPLETE' && source?.ready) return '최신 수집 완료';
  if (attempt?.state === 'COMPLETE') return '완료 · 보완 필요';
  if (source?.latestComplete) return '이전 완료본 사용 중';
  return '수집 전';
}

export default function AdvertisingProfitabilityRefresh() {
  const control = useCollectionSourceControl(advertisingProfitabilityCollection);
  const source = control.status;
  const attempt = source?.latestAttempt;
  const latestComplete = source?.latestComplete;
  const running = attempt?.state === 'RUNNING';
  const cancelled = stoppedAttempt(attempt);
  const label = control.statusRead === 'loading'
    ? '상태 확인 중'
    : control.statusRead === 'unavailable'
      ? '상태 확인 필요'
      : statusText(attempt, source);

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
            {running && <p>브라우저에서 상품별 보고서를 수집하고 있습니다.</p>}
            {attempt?.state === 'FAILED' && (
              <p style={{ color: cancelled ? 'var(--warning)' : 'var(--danger)' }}>
                {cancelled ? COLLECTION_STOPPED_MESSAGE : attemptFailureText(attempt, 'coupang_ad_profitability') ?? '최근 수집에 실패했습니다.'}
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
          </div>
        </div>
        <CollectionStartControl
          control={control}
          startLabel="상품별 광고비 보고서 수집"
          onStart={() => control.start()}
          onStop={control.stop}
        />
      </div>
    </section>
  );
}
