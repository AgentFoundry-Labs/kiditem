'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { isTerminalOperationStatus, useOperationRun } from '@/hooks/useOperationRun';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  TREND_SOURCE_META,
  TREND_SOURCE_ORDER,
  collectTrend,
  fetchTrendSeeds,
  type TrendSource,
} from '../lib/trend-collection-api';
import { TrendSeedManager } from './TrendSeedManager';
import { TrendCollectionViews } from './TrendCollectionViews';

const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

/** Server-owned OperationRun을 요청하고 결과는 ledger의 terminal state에서 확인한다. */
export function TrendCollectionSection() {
  const queryClient = useQueryClient();
  const [collectSources, setCollectSources] = useState<Set<TrendSource>>(
    new Set(TREND_SOURCE_ORDER),
  );
  const [operationRunId, setOperationRunId] = useState<string | null>(null);
  const terminalNotificationRunId = useRef<string | null>(null);
  const operationRun = useOperationRun(operationRunId);

  const seedsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendSeeds(),
    queryFn: fetchTrendSeeds,
    staleTime: 60 * 1000,
  });
  const enabledSeedCount = (seedsQuery.data ?? []).filter((seed) => seed.enabled).length;

  const collectMutation = useMutation({
    mutationFn: () => collectTrend(
      TREND_SOURCE_ORDER.filter((source) => collectSources.has(source)),
    ),
    onSuccess: (run) => {
      setOperationRunId(run.id);
      toast.success('트렌드 수집을 시작했습니다. 완료 상태를 확인 중입니다.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '트렌드 수집을 시작하지 못했습니다.'),
  });

  useEffect(() => {
    const run = operationRun.data;
    if (!run || !isTerminalOperationStatus(run.status) || terminalNotificationRunId.current === run.id) {
      return;
    }
    terminalNotificationRunId.current = run.id;
    if (run.status === 'succeeded') {
      toast.success('트렌드 수집이 완료되었습니다. 최신 데이터를 불러옵니다.');
    } else {
      toast.error(run.error?.message ?? '트렌드 수집이 완료되지 않았습니다.');
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
  }, [operationRun.data, queryClient]);

  const toggleCollectSource = (source: TrendSource) => {
    setCollectSources((previous) => {
      const next = new Set(previous);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const requestPending = collectMutation.isPending;
  const canCollect = collectSources.size > 0 && !requestPending;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">트렌드 수집</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              선택한 소스는 Agent OS 작업으로 기록되며, 브라우저가 필요하면 안전하게 대기합니다.
            </p>
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
                      disabled={requestPending}
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
              {requestPending ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              {requestPending ? '수집 중…' : '트렌드 수집'}
            </button>
          </div>
        </div>

        {enabledSeedCount === 0 && !seedsQuery.isLoading && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-xs leading-5 text-purple-900">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <p>사용자 시드가 없어 기본 문구·완구 시드로 수집합니다. 특정 브랜드·캐릭터·상품을 함께 추적하려면 아래에서 시드를 추가하세요.</p>
          </div>
        )}

        {operationRun.data && (
          <p className="mt-4 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            현재 작업 상태: <strong>{operationRun.data.status}</strong>
            {operationRun.data.status === 'waiting_runtime' ? ' · 브라우저 런타임 연결을 기다리고 있습니다.' : ''}
          </p>
        )}
      </section>

      <TrendSeedManager seeds={seedsQuery.data ?? []} isLoading={seedsQuery.isLoading} />
      <TrendCollectionViews />
    </div>
  );
}
