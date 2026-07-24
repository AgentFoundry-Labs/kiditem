'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import {
  TREND_SOURCE_META,
  TREND_SOURCE_ORDER,
  collectTrend,
  fetch1688CollectionTargets,
  fetchTrendSeeds,
  type TrendCollectResult,
  type TrendSourceCollectResult,
  type TrendSource,
} from '../lib/trend-collection-api';
import {
  canFallBackToServer1688,
  collect1688TrendsFromChrome,
  TrendExtensionError,
} from '../lib/1688-trend-extension';
import { TrendSeedManager } from './TrendSeedManager';
import { TrendCollectionViews } from './TrendCollectionViews';

const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

/** 문구·완구 시장 트렌드 수동 수집 트리거 + 시드 관리 + 스냅샷 뷰. */
export function TrendCollectionSection() {
  const queryClient = useQueryClient();
  const [collectSources, setCollectSources] = useState<Set<TrendSource>>(
    new Set(TREND_SOURCE_ORDER),
  );
  const [lastResult, setLastResult] = useState<TrendCollectResult | null>(null);
  const [collectionRunId, setCollectionRunId] = useState<string | null>(null);
  const collectionAbortControllerRef = useRef<AbortController | null>(null);

  const seedsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendSeeds(),
    queryFn: fetchTrendSeeds,
    staleTime: 60 * 1000,
  });

  const enabledSeedCount = (seedsQuery.data ?? []).filter((seed) => seed.enabled).length;

  const collectMutation = useMutation({
    mutationFn: async () => {
      const selected = TREND_SOURCE_ORDER.filter((source) => collectSources.has(source));
      const controller = new AbortController();
      collectionAbortControllerRef.current = controller;
      try {
        return await collectSelectedTrendSources(
          selected,
          setCollectionRunId,
          controller.signal,
        );
      } finally {
        if (collectionAbortControllerRef.current === controller) {
          collectionAbortControllerRef.current = null;
        }
      }
    },
    onSuccess: (result) => {
      setLastResult(result);
      const total = result.results.reduce((sum, item) => sum + item.collected, 0);
      const failed = result.results.filter((item) => !item.ok);
      if (failed.length === 0) {
        toast.success(`트렌드 수집 완료 · ${formatNumber(total)}건 저장`);
      } else {
        toast.warning(`수집 완료 · ${failed.length}개 소스 실패 (${formatNumber(total)}건 저장)`);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trend() });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '트렌드 수집 실패'),
  });
  const collectionSession = useBrowserCollectionSession(collectionRunId, {
    // 1688 mutation 내부 observer가 1초 주기로 종료를 기다리므로,
    // 같은 run을 generic query가 중복 polling하지 않도록 한다.
    enabled: !collectMutation.isPending,
  });

  useEffect(() => () => {
    // 페이지가 사라져도 확장의 run은 계속한다. 웹 observer만 정리한다.
    collectionAbortControllerRef.current?.abort();
  }, []);

  const toggleCollectSource = (source: TrendSource) => {
    setCollectSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const running = collectMutation.isPending;
  const canCollect = collectSources.size > 0 && !running;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              트렌드 수집
            </h2>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:min-w-[280px]">
            <div>
              <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                수집 소스
              </span>
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
              onClick={() => collectMutation.mutate()}
              disabled={!canCollect}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                pressable,
              )}
            >
              {running ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  수집 중… 키워드별 순차 처리
                </>
              ) : (
                <>
                  <RefreshCw size={17} />
                  트렌드 수집
                </>
              )}
            </button>
          </div>
        </div>

        {enabledSeedCount === 0 && !seedsQuery.isLoading && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-xs leading-5 text-purple-900">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <p>
              사용자 시드가 없어 기본 문구·완구 시드로 수집합니다. 특정 브랜드·캐릭터·상품을
              함께 추적하려면 아래에서 시드를 추가하세요.
            </p>
          </div>
        )}

        {collectionSession.data && (
          <BrowserCollectionRunControls
            className="mt-4"
            session={collectionSession.data}
            onWebRestart={async () => {
              await collectMutation.mutateAsync();
            }}
          />
        )}

        {lastResult && (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                최근 수집 결과
              </p>
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

async function collectSelectedTrendSources(
  selected: TrendSource[],
  onCollectionRunId: (runId: string) => void,
  signal?: AbortSignal,
): Promise<TrendCollectResult> {
  const serverSources = selected.filter((source) => source !== '1688');
  const serverResult = serverSources.length > 0
    ? await collectTrend(serverSources)
    : { businessDate: '', results: [] };
  const results = [...serverResult.results];
  let businessDate = serverResult.businessDate;

  if (selected.includes('1688')) {
    let extensionInput = { keywordCount: 0, maxResults: 20 };
    try {
      const targets = await fetch1688CollectionTargets();
      extensionInput = { ...extensionInput, keywordCount: targets.length };
      const extensionResult = await collect1688TrendsFromChrome(
        targets.map((target) => target.keyword),
        onCollectionRunId,
        signal,
      );
      onCollectionRunId(extensionResult.runId);
      businessDate = extensionResult.businessDate ?? businessDate;
      results.push({
        source: '1688',
        ok: extensionResult.errors.length === 0,
        collected: extensionResult.collected,
        error: extensionResult.errors.length > 0
          ? extensionResult.errors
              .map((item) => `${item.keyword}: ${item.message}`)
              .join(' · ')
          : undefined,
      });
    } catch (error) {
      if (error instanceof TrendExtensionError && error.runId) {
        onCollectionRunId(error.runId);
      }
      if (
        error instanceof TrendExtensionError &&
        error.code === 'extension_missing'
      ) {
        const missing = await recordMissingBrowserCollection('sourcing.1688_trend', {
          ...extensionInput,
        });
        onCollectionRunId(missing.runId);
      }
      if (canFallBackToServer1688(error)) {
        const fallback = await collectTrend(['1688']);
        businessDate = fallback.businessDate || businessDate;
        const fallbackResult = fallback.results.find((result) => result.source === '1688');
        results.push(fallbackResult?.ok
          ? fallbackResult
          : {
              source: '1688',
              ok: false,
              collected: 0,
              error: [errorMessage(error), fallbackResult?.error]
                .filter(Boolean)
                .join(' · '),
            });
      } else {
        results.push({
          source: '1688',
          ok: false,
          collected: 0,
          error: errorMessage(error),
        });
      }
    }
  }

  results.sort(
    (a, b) => TREND_SOURCE_ORDER.indexOf(a.source) - TREND_SOURCE_ORDER.indexOf(b.source),
  );
  return {
    businessDate: businessDate || kstCalendarDate(),
    results,
  };
}

function kstCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
        {result.ok ? (
          <CheckCircle2 size={15} className="text-emerald-600" />
        ) : (
          <XCircle size={15} className="text-rose-600" />
        )}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {formatNumber(result.collected)}
        <span className="ml-1 text-xs font-medium text-[var(--text-tertiary)]">건</span>
      </p>
      {result.error && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-rose-700" title={result.error}>
          {result.error}
        </p>
      )}
    </article>
  );
}
