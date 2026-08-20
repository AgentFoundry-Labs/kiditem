'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SourcingOperationResultSchema,
  type SourcingOperationResult,
} from '@kiditem/shared/sourcing';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { SourcingOperationRunPanel } from '../../components/SourcingOperationRunPanel';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import {
  TREND_SOURCE_META,
  TREND_SOURCE_ORDER,
  fetchTrendSeeds,
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
const TREND_SOURCE_SET: ReadonlySet<string> = new Set(TREND_SOURCE_ORDER);

type TrendOperationSourceResult = SourcingOperationResult['sources'][number] & {
  source: TrendSource;
};

/** 기존 수집 화면의 버튼으로 공통 실행 경로를 요청한다. */
export function TrendCollectionSection() {
  const [collectSources, setCollectSources] = useState<Set<TrendSource>>(
    new Set(TREND_SOURCE_ORDER),
  );
  const trendOperation = useSourcingOperationAction({
    operationKey: 'sourcing.collect_daily_trends',
    input: DEFAULT_TREND_OPERATION_INPUT,
    snapshotQueryKey: queryKeys.sourcing.trend(),
    wakeBrowserRuntime: true,
  });

  const seedsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendSeeds(),
    queryFn: fetchTrendSeeds,
    staleTime: 60 * 1000,
  });
  const enabledSeedCount = (seedsQuery.data ?? []).filter((seed) => seed.enabled).length;
  const parsedResult = trendOperation.run?.status === 'succeeded'
    ? SourcingOperationResultSchema.safeParse(trendOperation.run.result)
    : null;
  const lastResult = parsedResult?.success ? parsedResult.data : null;
  const lastSourceResults = lastResult?.sources.filter(isTrendSourceResult) ?? [];

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

        {lastResult && lastSourceResults.length > 0 ? (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">최근 수집 결과</p>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">
                반영 {formatNumber(lastResult.summary.accepted)}건
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {lastSourceResults.map((result) => (
                <CollectResultCard key={result.source} result={result} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <TrendSeedManager seeds={seedsQuery.data ?? []} isLoading={seedsQuery.isLoading} />
      <TrendCollectionViews />
    </div>
  );
}

function isTrendSourceResult(
  result: SourcingOperationResult['sources'][number],
): result is TrendOperationSourceResult {
  return TREND_SOURCE_SET.has(result.source);
}

function CollectResultCard({ result }: { result: TrendOperationSourceResult }) {
  const meta = TREND_SOURCE_META[result.source];
  const successful = result.outcome === 'complete' || result.outcome === 'no_change';
  return (
    <article
      className={cn(
        'rounded-lg border px-3 py-2.5',
        successful
          ? 'border-[var(--border)] bg-[var(--surface-sunken)]'
          : 'border-rose-200 bg-rose-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text-primary)]">{meta.label}</span>
        {successful
          ? <CheckCircle2 size={15} className="text-emerald-600" />
          : <XCircle size={15} className="text-rose-600" />}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {formatNumber(result.accepted)}건
      </p>
      {result.failed > 0 ? (
        <p className="mt-0.5 text-[11px] leading-4 text-rose-700">
          일부 항목 수집에 실패했습니다.
        </p>
      ) : null}
    </article>
  );
}
