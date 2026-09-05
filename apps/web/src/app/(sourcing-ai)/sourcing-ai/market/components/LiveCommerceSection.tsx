'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  PackageSearch,
  Radio,
} from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  collectTaobaoLive,
  fetchLiveCommerceSnapshots,
  fetchLiveCommerceStatus,
  type LiveCommerceSource,
  type LiveCommerceSourceStatus,
} from '../lib/live-commerce-api';
import {
  collectSourcingLiveCommerceFromExtension,
  fetchSourcingLiveCommerceSourceStatus,
  type SourcingLiveCommerceSourceStatus,
} from '../../lib/sourcing-live-commerce-source-owner';

const HISTORY_DAYS = 7;

const SOURCE_META: Record<LiveCommerceSource, { label: string; className: string }> = {
  taobao: { label: '타오바오 라이브', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
  '1688': { label: '1688 라이브', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  douyin: { label: '도우인', className: 'bg-slate-900 text-white ring-slate-900' },
};

export function LiveCommerceSection() {
  const queryClient = useQueryClient();
  const [taobaoLiveIds, setTaobaoLiveIds] = useState('');
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserStatusUrl, setBrowserStatusUrl] = useState<string | null>(null);
  const retryKeysByUrl = useRef(new Map<string, string>());
  const taobaoInput = useMemo(() => ({ liveIds: splitLiveIds(taobaoLiveIds) }), [taobaoLiveIds]);
  const taobaoRetryKeys = useRef(new Map<string, { key: string; attemptId: string | null }>());
  const statusQueryKey = [...queryKeys.sourcing.liveCommerceStatus(), taobaoInput] as const;
  const snapshotsQueryKey = queryKeys.sourcing.liveCommerceSnapshots(HISTORY_DAYS);
  const snapshotQueryKeys = [statusQueryKey, snapshotsQueryKey, queryKeys.sourcing.liveCommerceKeywords(HISTORY_DAYS)] as const;

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => fetchLiveCommerceStatus(taobaoInput),
    refetchInterval: (query) => query.state.data?.sources.some((source) => source.sourceStatus?.refreshing) ? 5_000 : false,
    staleTime: 60 * 1000,
  });
  const snapshotsQuery = useQuery({
    queryKey: snapshotsQueryKey,
    queryFn: () => fetchLiveCommerceSnapshots(HISTORY_DAYS),
    staleTime: 60 * 1000,
  });
  const taobaoStatus = statusQuery.data?.sources.find((item) => item.source === 'taobao');
  const taobaoCollection = useMutation({
    mutationFn: async (input: { liveIds: string[] }) => {
      const fingerprint = JSON.stringify(input);
      const request = taobaoRetryKeys.current.get(fingerprint) ?? { key: crypto.randomUUID(), attemptId: null };
      taobaoRetryKeys.current.set(fingerprint, request);
      const result = await collectTaobaoLive(input, request.key);
      if (taobaoRetryKeys.current.get(fingerprint) === request) {
        if (result.state === 'RUNNING') request.attemptId = result.attemptId;
        else taobaoRetryKeys.current.delete(fingerprint);
      }
      if (result.state === 'FAILED') throw new Error(result.errorMessage ?? '타오바오 수집에 실패했습니다.');
      return result;
    },
    onSettled: async () => {
      await Promise.all(snapshotQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
  const latestTaobaoAttempt = taobaoStatus?.sourceStatus?.latestAttempt;
  useEffect(() => {
    if (!latestTaobaoAttempt || latestTaobaoAttempt.state === 'RUNNING') return;
    for (const [fingerprint, request] of taobaoRetryKeys.current) {
      if (request.attemptId === latestTaobaoAttempt.attemptId) {
        taobaoRetryKeys.current.delete(fingerprint);
      }
    }
  }, [latestTaobaoAttempt, taobaoCollection.data]);
  const completeAttemptId = taobaoStatus?.sourceStatus?.latestComplete?.attemptId;
  useEffect(() => {
    if (completeAttemptId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.liveCommerceSnapshots(HISTORY_DAYS) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.liveCommerceKeywords(HISTORY_DAYS) });
    }
  }, [completeAttemptId, queryClient]);
  const browserSourceStatusQueryKey = [
    ...queryKeys.sourcing.liveCommerceExtensionStatus(),
    browserStatusUrl,
  ] as const;
  const browserSourceStatusQuery = useQuery({
    queryKey: browserSourceStatusQueryKey,
    queryFn: () => fetchSourcingLiveCommerceSourceStatus(browserStatusUrl ?? ''),
    enabled: browserStatusUrl !== null,
    refetchInterval: (query) => (
      query.state.data?.latestAttempt?.state === 'RUNNING' ? 5_000 : false
    ),
  });
  const browserCollectionMutation = useMutation({
    mutationFn: async (url: string) => {
      const idempotencyKey = retryKeysByUrl.current.get(url) ?? crypto.randomUUID();
      retryKeysByUrl.current.set(url, idempotencyKey);
      const clearRetryKey = () => {
        if (retryKeysByUrl.current.get(url) === idempotencyKey) {
          retryKeysByUrl.current.delete(url);
        }
      };
      const result = await collectSourcingLiveCommerceFromExtension({ idempotencyKey, url });
      if (result.terminalState === 'COMPLETE') {
        clearRetryKey();
        if (!result.success) {
          throw new Error('KidItem OS 익스텐션이 완료 상태와 충돌하는 결과를 반환했습니다.');
        }
        return result;
      }
      if (result.terminalState === 'FAILED') {
        clearRetryKey();
        throw new Error(result.error ?? '라이브 방송 수집에 실패했습니다. 새로 시도해주세요.');
      }
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: browserSourceStatusQueryKey });
      if (result.terminalState === 'COMPLETE') {
        await Promise.all(snapshotQueryKeys.map((queryKey) => (
          queryClient.invalidateQueries({ queryKey })
        )));
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: browserSourceStatusQueryKey });
    },
  });
  const taobaoRunning = taobaoCollection.isPending || taobaoStatus?.sourceStatus?.refreshing === true;
  const browserRunning = browserCollectionMutation.isPending
    || browserSourceStatusQuery.data?.latestAttempt?.state === 'RUNNING';

  const productCountByBroadcast = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of snapshotsQuery.data?.products ?? []) {
      const key = `${product.source}:${product.broadcastId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [snapshotsQuery.data?.products]);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Radio size={16} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">중국 라이브 커머스</h3>
            <p className="mt-0.5 text-xs leading-5 text-[var(--text-tertiary)]">
              타오바오는 공식 API로, 1688·도우인은 로그인된 Chrome 방송 화면에서 상품을 수집합니다.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {(statusQuery.data?.sources ?? []).map((status) => (
            <SourceStatusCard
              key={status.source}
              status={status}
            />
          ))}
          {statusQuery.isLoading && [0, 1, 2].map((item) => (
            <div key={item} className="h-[70px] animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
          ))}
        </div>
      </div>

      <div className="grid border-b border-[var(--border)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--border)]">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-orange-600" />
            <p className="text-xs font-bold text-[var(--text-primary)]">타오바오 공식 API 수집</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">
            방송 ID는 선택사항입니다. 비워두면 오늘 날짜의 방송·상품 목록을 조회합니다.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={taobaoLiveIds}
              onChange={(event) => setTaobaoLiveIds(event.target.value)}
              placeholder="방송 ID 여러 개: 123, 456"
              className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            <button
              type="button"
              disabled={!taobaoStatus?.configured || taobaoRunning}
              onClick={() => {
                taobaoCollection.mutate(taobaoInput);
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {taobaoRunning ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
              {taobaoRunning ? '수집 중…' : '공식 수집'}
            </button>
          </div>
          {taobaoStatus && !taobaoStatus.configured && (
            <p className="mt-2 text-[11px] font-medium text-amber-700">
              서버 설정 필요 · {taobaoStatus.missing.join(' · ')}
            </p>
          )}
          {taobaoStatus?.sourceStatus && (
            <BrowserLiveCommerceSourceStatus source={taobaoStatus.sourceStatus} collectionError={null} />
          )}
          {(taobaoStatus?.sourceStatus?.latestComplete?.warnings ?? []).map((warning) => (
            <p key={warning} className="mt-2 text-xs text-amber-700">{warning}</p>
          ))}
          {taobaoCollection.error && (
            <p role="alert" className="mt-2 text-xs text-red-600">{taobaoCollection.error.message}</p>
          )}
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4 lg:border-t-0">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-purple-600" />
            <p className="text-xs font-bold text-[var(--text-primary)]">1688·도우인 방송 URL 수집</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">
            방송 URL을 넣으면 새 탭에서 로그인·보안문자를 확인한 뒤 상품을 저장합니다.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={browserUrl}
              onChange={(event) => setBrowserUrl(event.target.value)}
              placeholder="https://live.douyin.com/... 또는 https://zb.1688.com/..."
              className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            <button
              type="button"
              disabled={!browserUrl.trim() || browserRunning}
              onClick={() => {
                const url = browserUrl.trim();
                setBrowserStatusUrl(url);
                browserCollectionMutation.mutate(url);
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 text-xs font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {browserRunning ? <Loader2 size={14} className="animate-spin" /> : <PackageSearch size={14} />}
              {browserRunning ? '수집 중…' : '방송 수집'}
            </button>
          </div>
          <BrowserLiveCommerceSourceStatus
            source={browserSourceStatusQuery.data}
            collectionError={browserCollectionMutation.error}
          />
        </div>
      </div>

      {snapshotsQuery.isError ? (
        <div className="px-5 py-8 text-center text-xs text-rose-700">
          라이브 수집 결과를 불러오지 못했습니다. {errorMessage(snapshotsQuery.error)}
        </div>
      ) : (snapshotsQuery.data?.broadcasts.length ?? 0) === 0 && (snapshotsQuery.data?.products.length ?? 0) === 0 ? (
        <div className="px-5 py-10 text-center">
          <Radio size={24} className="mx-auto text-[var(--text-quaternary)]" />
          <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">아직 수집한 중국 라이브 방송이 없습니다.</p>
        </div>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="min-w-0 border-b border-[var(--border)] xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-xs font-bold text-[var(--text-primary)]">최근 방송</p>
              <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
                {formatNumber(snapshotsQuery.data?.broadcasts.length ?? 0)}개
              </span>
            </div>
            <ul className="max-h-[430px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {snapshotsQuery.data?.broadcasts.map((broadcast) => {
                const products = productCountByBroadcast.get(`${broadcast.source}:${broadcast.broadcastId}`) ?? 0;
                return (
                  <li key={`${broadcast.source}-${broadcast.broadcastId}`} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                      {broadcast.coverImageUrl ? (
                        <img src={broadcast.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[var(--text-quaternary)]"><Radio size={15} /></span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <SourceBadge source={broadcast.source} />
                        <span className="truncate text-[11px] text-[var(--text-tertiary)]">{broadcast.broadcasterName ?? '판매자 미확인'}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">
                        {broadcast.sourceUrl ? (
                          <a href={broadcast.sourceUrl} target="_blank" rel="noreferrer noopener" className="hover:text-purple-700">
                            {broadcast.title ?? `방송 ${broadcast.broadcastId}`}
                          </a>
                        ) : broadcast.title ?? `방송 ${broadcast.broadcastId}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[10px] leading-4 text-[var(--text-tertiary)]">
                      <p>상품 <strong className="text-[var(--text-primary)]">{formatNumber(products)}</strong></p>
                      <p>시청 {broadcast.viewerCount === null ? '—' : formatNumber(broadcast.viewerCount)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-xs font-bold text-[var(--text-primary)]">방송 노출 상품</p>
              <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
                {formatNumber(snapshotsQuery.data?.products.length ?? 0)}개
              </span>
            </div>
            <ul className="max-h-[430px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {snapshotsQuery.data?.products.slice(0, 100).map((product) => (
                <li key={`${product.source}-${product.broadcastId}-${product.productId}`} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--surface-sunken)]">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[var(--text-quaternary)]"><PackageSearch size={15} /></span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><SourceBadge source={product.source} /></div>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">
                      {product.title ?? product.productId}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold tabular-nums text-orange-600">
                      {product.priceCny === null ? '가격 미표시' : `¥${formatNumber(product.priceCny)}`}
                    </p>
                    {product.sourceUrl && (
                      <a href={product.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-700">
                        상품 열기 <ArrowUpRight size={10} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function BrowserLiveCommerceSourceStatus({
  source,
  collectionError,
}: {
  source: SourcingLiveCommerceSourceStatus | undefined;
  collectionError: Error | null;
}) {
  if (!source && !collectionError) return null;

  const refreshing = source?.latestAttempt?.state === 'RUNNING';
  const unhealthy = source?.status === 'STALE' || source?.status === 'MISSING';
  const message = refreshing
    ? '라이브 방송을 수집 중입니다. 마지막 완료 데이터는 계속 표시됩니다.'
    : unhealthy
      ? `원천 상태 이상 · ${source?.errorMessage ?? collectionError?.message ?? '최신 완료 데이터를 확인할 수 없습니다.'}`
      : collectionError?.message ?? '라이브 방송 원천 데이터가 최신 상태입니다.';

  return (
    <p
      role="status"
      className={cn(
        'mt-3 rounded-lg border px-3 py-2 text-xs font-semibold',
        refreshing
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : unhealthy || collectionError
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {message}
      {source?.actualCutoffAt && (
        <span className="ml-1.5 font-medium opacity-80">
          기준 {formatDateTime(source.actualCutoffAt, { month: '2-digit', day: '2-digit' })}
        </span>
      )}
    </p>
  );
}

function SourceStatusCard({
  status,
}: {
  status: LiveCommerceSourceStatus;
}) {
  const meta = SOURCE_META[status.source];
  const configured = status.configured;
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--text-primary)]">{meta.label}</span>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset',
          configured ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200',
        )}>
          {configured && <CheckCircle2 size={10} />}
          {configured ? (status.connection === 'official-api' ? 'API 준비' : '확장 준비') : '설정 필요'}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] text-[var(--text-tertiary)]">
        {status.latestCapturedAt
          ? `최근 ${formatDateTime(status.latestCapturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
          : status.requiresLogin ? '로그인된 방송 URL 필요' : status.missing.join(' · ')}
      </p>
    </article>
  );
}

function SourceBadge({ source }: { source: LiveCommerceSource }) {
  const meta = SOURCE_META[source];
  return <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset', meta.className)}>{meta.label}</span>;
}

function splitLiveIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 30);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '라이브 방송 수집에 실패했습니다.';
}
