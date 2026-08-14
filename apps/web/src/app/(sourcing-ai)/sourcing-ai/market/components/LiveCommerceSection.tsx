'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  PackageSearch,
  Radio,
} from 'lucide-react';
import { isTerminalOperationStatus } from '@/hooks/useOperationRun';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  fetchLiveCommerceSnapshots,
  fetchLiveCommerceStatus,
  type LiveCommerceSource,
  type LiveCommerceSourceStatus,
} from '../lib/live-commerce-api';
import { SourcingOperationRunPanel } from '../../components/SourcingOperationRunPanel';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';

const HISTORY_DAYS = 7;

const SOURCE_META: Record<LiveCommerceSource, { label: string; className: string }> = {
  taobao: { label: '타오바오 라이브', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
  '1688': { label: '1688 라이브', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  douyin: { label: '도우인', className: 'bg-slate-900 text-white ring-slate-900' },
};

export function LiveCommerceSection() {
  const [taobaoLiveIds, setTaobaoLiveIds] = useState('');
  const [browserUrl, setBrowserUrl] = useState('');
  const statusQueryKey = queryKeys.sourcing.liveCommerceStatus();
  const snapshotsQueryKey = queryKeys.sourcing.liveCommerceSnapshots(HISTORY_DAYS);
  const snapshotQueryKeys = [statusQueryKey, snapshotsQueryKey] as const;

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: fetchLiveCommerceStatus,
    staleTime: 60 * 1000,
  });
  const snapshotsQuery = useQuery({
    queryKey: snapshotsQueryKey,
    queryFn: () => fetchLiveCommerceSnapshots(HISTORY_DAYS),
    staleTime: 60 * 1000,
  });
  const taobaoStatus = statusQuery.data?.sources.find((item) => item.source === 'taobao');
  const taobaoOperationInput = useMemo(
    () => ({ liveIds: splitLiveIds(taobaoLiveIds) }),
    [taobaoLiveIds],
  );
  const browserOperationInput = useMemo(
    () => ({ url: browserUrl.trim() }),
    [browserUrl],
  );
  const taobaoOperation = useSourcingOperationAction({
    operationKey: 'sourcing.collect_taobao_live',
    input: taobaoOperationInput,
    snapshotQueryKey: snapshotsQueryKey,
    snapshotQueryKeys,
    wakeBrowserRuntime: false,
  });
  const browserOperation = useSourcingOperationAction({
    operationKey: 'sourcing.collect_live_commerce_url',
    input: browserOperationInput,
    snapshotQueryKey: snapshotsQueryKey,
    snapshotQueryKeys,
  });
  const taobaoRunning = taobaoOperation.isStarting
    || (taobaoOperation.run !== null
      && !isTerminalOperationStatus(taobaoOperation.run.status));
  const browserRunning = browserOperation.isStarting
    || (browserOperation.run !== null
      && !isTerminalOperationStatus(browserOperation.run.status));

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
                void taobaoOperation.start({ liveIds: splitLiveIds(taobaoLiveIds) });
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
          <SourcingOperationRunPanel
            className="mt-3"
            run={taobaoOperation.run}
            onCancel={() => { void taobaoOperation.cancel(); }}
            onRetryAttention={() => { void taobaoOperation.retryAttention(); }}
            isCancelling={taobaoOperation.isCancelling}
            isRetrying={taobaoOperation.isRetrying}
          />
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
                void browserOperation.start({ url: browserUrl.trim() });
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 text-xs font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {browserRunning ? <Loader2 size={14} className="animate-spin" /> : <PackageSearch size={14} />}
              {browserRunning ? '수집 중…' : '방송 수집'}
            </button>
          </div>
          <SourcingOperationRunPanel
            className="mt-3"
            run={browserOperation.run}
            onCancel={() => { void browserOperation.cancel(); }}
            onRetryAttention={() => { void browserOperation.retryAttention(); }}
            isCancelling={browserOperation.isCancelling}
            isRetrying={browserOperation.isRetrying}
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
