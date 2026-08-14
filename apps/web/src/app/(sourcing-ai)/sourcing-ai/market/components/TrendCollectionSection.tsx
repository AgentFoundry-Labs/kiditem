'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { SourcingOperationRunPanel } from '../../components/SourcingOperationRunPanel';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import {
  TREND_SOURCE_META,
  TREND_SOURCE_ORDER,
  fetchTrendSeeds,
  type TrendCollectResult,
  type TrendSourceCollectResult,
  type TrendSource,
} from '../lib/trend-collection-api';
import { TrendSeedManager } from './TrendSeedManager';
import { TrendCollectionViews } from './TrendCollectionViews';

const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';
const DEFAULT_TREND_OPERATION_INPUT = {
  sources: [...TREND_SOURCE_ORDER],
} as const;
const ACTIVE_OPERATION_STATUSES = new Set([
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
  'attention_required',
]);

/** 기존 수집 화면의 버튼으로 공통 실행 경로를 요청한다. */
export function TrendCollectionSection() {
  const [collectSources, setCollectSources] = useState<Set<TrendSource>>(
    new Set(TREND_SOURCE_ORDER),
  );
  const trendOperation = useSourcingOperationAction({
    operationKey: 'sourcing.collect_daily_trends',
    input: DEFAULT_TREND_OPERATION_INPUT,
    snapshotQueryKey: queryKeys.sourcing.trend(),
    wakeBrowserRuntime: false,
  });

  const seedsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendSeeds(),
    queryFn: fetchTrendSeeds,
    staleTime: 60 * 1000,
  });
  const enabledSeedCount = (seedsQuery.data ?? []).filter((seed) => seed.enabled).length;
  const lastResult = trendOperation.run?.status === 'succeeded'
    ? toTrendCollectResult(trendOperation.run.result)
    : null;

  const toggleCollectSource = (source: TrendSource) => {
    setCollectSources((previous) => {
      const next = new Set(previous);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const running = trendOperation.isStarting
    || (trendOperation.run !== null
      && ACTIVE_OPERATION_STATUSES.has(trendOperation.run.status));
  const canCollect = collectSources.size > 0 && !running;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">트렌드 수집</h2>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:min-w-[280px]">
            <div>
              <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">수집 소스</span>
              <div className="flex flex-wrap gap-1.5">
                {TREND_SOURCE_ORDER.map((source) => {
                  const active = collectSources.has(source);
                  const meta = TREND_SOURCE_META[source];
                  return (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={active}
                      disabled={running}
                      onClick={() => toggleCollectSource(source)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-60',
                        pressable,
                        active ? meta.className : 'bg-white text-[var(--text-tertiary)] ring-[var(--border)]',
                      )}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void trendOperation.start({
                sources: TREND_SOURCE_ORDER.filter((source) => collectSources.has(source)),
              })}
              disabled={!canCollect}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                pressable,
              )}
            >
              {running ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              {running ? '수집 중…' : '트렌드 수집'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <SourcingOperationRunPanel
            run={trendOperation.run}
            onCancel={async () => {
              await trendOperation.cancel();
            }}
            onRetryAttention={async () => {
              await trendOperation.retryAttention();
            }}
            isCancelling={trendOperation.isCancelling}
            isRetrying={trendOperation.isRetrying}
          />
        </div>

        {enabledSeedCount === 0 && !seedsQuery.isLoading && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-xs leading-5 text-purple-900">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <p>사용자 시드가 없어 기본 문구·완구 시드로 수집합니다. 특정 브랜드·캐릭터·상품을 함께 추적하려면 아래에서 시드를 추가하세요.</p>
          </div>
        )}

        {lastResult && (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">최근 수집 결과</p>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">
                {lastResult.businessDate}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {lastResult.results.map((result) => (
                <CollectResultCard key={result.source} result={result} />
              ))}
            </div>
          </div>
        )}
      </section>

      <TrendSeedManager seeds={seedsQuery.data ?? []} isLoading={seedsQuery.isLoading} />
      <TrendCollectionViews />
    </div>
  );
}

function toTrendCollectResult(value: unknown): TrendCollectResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { businessDate?: unknown; results?: unknown };
  if (typeof candidate.businessDate !== 'string' || !Array.isArray(candidate.results)) return null;
  const results: TrendSourceCollectResult[] = [];
  for (const item of candidate.results) {
    if (!item || typeof item !== 'object') return null;
    const result = item as Record<string, unknown>;
    if (
      (result.source !== 'naver' && result.source !== '1688' && result.source !== 'shorts')
      || typeof result.ok !== 'boolean'
      || typeof result.collected !== 'number'
      || (result.error !== undefined && typeof result.error !== 'string')
    ) return null;
    results.push({
      source: result.source,
      ok: result.ok,
      collected: result.collected,
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
    });
  }
  return { businessDate: candidate.businessDate, results };
}

function CollectResultCard({ result }: { result: TrendSourceCollectResult }) {
  const meta = TREND_SOURCE_META[result.source];
  return (
    <article
      className={cn(
        'rounded-lg border px-3 py-2.5',
        result.ok ? 'border-[var(--border)] bg-[var(--surface-sunken)]' : 'border-rose-200 bg-rose-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text-primary)]">{meta.label}</span>
        {result.ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-rose-600" />}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {formatNumber(result.collected)}<span className="ml-1 text-xs font-medium text-[var(--text-tertiary)]">건</span>
      </p>
      {result.error ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-rose-700" title={result.error}>{result.error}</p> : null}
    </article>
  );
}
