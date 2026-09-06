'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CoupangCatalogCollectionRunSchema } from '@kiditem/shared/coupang-catalog-snapshot';
import { useQuery } from '@tanstack/react-query';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { useCoupangCatalogImport } from '../hooks/useCoupangCatalogImport';
import {
  buildCoupangCatalogProgress,
  resolveCoupangCatalogError,
} from '../lib/coupang-catalog-progress';
import { channelListingsApi } from '../lib/channel-listings-api';

export function CoupangCatalogImportPanel() {
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => channelListingsApi.listAccounts(),
    staleTime: 60_000,
  });
  const coupangAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.channel === 'coupang'),
    [accountsQuery.data],
  );
  const [linkedAttempt] = useState(readCollectionAttempt);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(linkedAttempt?.channelAccountId ?? null);
  const catalogImport = useCoupangCatalogImport(selectedAccountId, linkedAttempt?.attemptId ?? null);
  const completedToasts = useRef(new Set<string>());

  useEffect(() => {
    if (selectedAccountId || coupangAccounts.length === 0) return;
    const resumed = catalogImport.activeAttempt
      ? coupangAccounts.find((account) => account.id === catalogImport.activeAttempt?.channelAccountId)
      : null;
    const preferred = resumed ?? coupangAccounts.find((account) => account.isPrimary) ?? coupangAccounts[0];
    setSelectedAccountId(preferred.id);
  }, [catalogImport.activeAttempt, coupangAccounts, selectedAccountId]);

  useEffect(() => {
    const status = catalogImport.serverStatus;
    if (status?.state !== 'COMPLETE' || completedToasts.current.has(status.attemptId)) return;
    completedToasts.current.add(status.attemptId);
    toast.success('쿠팡 상품 수집과 DB 반영이 완료되었습니다.');
  }, [catalogImport.serverStatus]);

  const server = catalogImport.serverStatus;
  const extension = catalogImport.extensionStatus;
  const isComplete = server?.state === 'COMPLETE';
  const isRunning = server?.state === 'RUNNING';
  const isCollecting = isRunning && extension?.active === true;
  const canResume = isRunning && !extension?.active;
  const attention = !isComplete ? extension?.attention : null;
  const progress = server ? buildCoupangCatalogProgress(server, Date.now()) : null;
  const error = isComplete ? null : resolveCoupangCatalogError({
    browserActive: isCollecting,
    extensionError: extension?.error ?? null,
    startError: errorMessage(catalogImport.startError) ?? errorMessage(catalogImport.readError),
    serverError: server?.error?.message ?? null,
  });

  const handleStart = async () => {
    try {
      await catalogImport.start();
      toast.info(canResume ? '쿠팡 상품 수집을 재개했습니다.' : '쿠팡 상품 수집을 시작했습니다.');
    } catch (cause) {
      toast.error(errorMessage(cause) || '쿠팡 상품 수집을 시작하지 못했습니다.');
    }
  };

  const handleStop = async () => {
    try {
      await catalogImport.cancel();
      toast.info('쿠팡 수집 서버 상태를 확인했습니다.');
    } catch (cause) {
      toast.error(errorMessage(cause) || '쿠팡 상품 수집을 중단하지 못했습니다.');
    }
  };

  const handleAttention = async () => {
    try { await catalogImport.openAttention(); }
    catch (cause) { toast.error(errorMessage(cause) || '확인 탭을 열지 못했습니다.'); }
  };

  return (
    <section className="border-b border-slate-200 bg-white px-5 py-3" aria-label="쿠팡 등록상품 가져오기">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Database size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-slate-900">쿠팡 등록상품 가져오기</h2>
              {server && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  {server.state === 'FAILED' ? '수집 실패' : isComplete ? '완료' : phaseLabel(server.phase)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              Wing의 상품·옵션·이미지를 모두 수집한 뒤 한 번에 반영합니다.
            </p>
            {server && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600" aria-live="polite">
                <span>{progress?.discoveredLabel}</span>
                <span>{progress?.hydratedLabel}</span>
                <span className="text-emerald-700">{progress?.publishedLabel}</span>
                <span>{progress?.publicationDetailsLabel}</span>
                {progress?.rateLabel && (
                  <span>
                    {progress.rateLabel}
                    {progress.etaLabel ? ` · ${progress.etaLabel}` : ''}
                  </span>
                )}
                {server.publication && (
                  <span>
                    이미지 URL {formatNumber(server.publication.changes.imageCount ?? 0)}개 연결
                  </span>
                )}
                {isComplete && <span className="text-emerald-700">DB 반영 완료</span>}
              </div>
            )}
            {isRunning && progress && progress.percent > 0 && (
              <div className="mt-2 h-1.5 w-full max-w-xl overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="쿠팡 채널 계정"
            value={selectedAccountId ?? ''}
            onChange={(event) => setSelectedAccountId(event.target.value || null)}
            disabled={isRunning || (!!catalogImport.activeAttempt && !server) || catalogImport.isStarting || coupangAccounts.length === 0}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {coupangAccounts.length === 0 && <option value="">쿠팡 계정 없음</option>}
            {coupangAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          {isCollecting ? (
              <button
                type="button"
                disabled
                className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-100 px-3 text-xs font-bold text-emerald-700"
              >
                <Loader2 size={13} className="animate-spin" />
                {attention ? '확인 필요' : '수집 중'}
              </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={!selectedAccountId || catalogImport.isStarting || catalogImport.isStopping}
              className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {catalogImport.isStarting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {canResume ? '수집 재개' : isComplete ? '다시 동기화' : 'Wing에서 가져오기'}
            </button>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={catalogImport.isStopping || catalogImport.isStarting}
              className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {catalogImport.isStopping && <Loader2 size={13} className="animate-spin" />}
              수집 중단
            </button>
          )}
        </div>
        {attention && (
          <div className="flex basis-full items-center gap-2 text-xs text-amber-800">
            <span>{attention.message}</span>
            {attention.canOpenTab && (
              <button type="button" onClick={() => void handleAttention()} className="font-bold underline">
                확인 탭 열기
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function readCollectionAttempt(): { attemptId: string; channelAccountId: string } | null {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const parsed = CoupangCatalogCollectionRunSchema.pick({
    attemptId: true, channelAccountId: true,
  }).safeParse({
    attemptId: query.get('collectionAttempt'), channelAccountId: query.get('channelAccountId'),
  });
  return parsed.success ? parsed.data : null;
}

function phaseLabel(phase: string): string {
  if (phase === 'discovery') return '상품 목록 확인';
  if (phase === 'hydration') return '상품 상세 수집';
  if (phase === 'ready_to_finalize') return 'DB 반영 준비';
  if (phase === 'publishing') return 'DB 반영 중';
  return '서버 확인 중';
}

function errorMessage(value: unknown): string | null {
  return value instanceof Error ? value.message : null;
}
