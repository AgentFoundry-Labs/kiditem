'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserCollectionRunIdSchema } from '@kiditem/shared/browser-collection-session';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import {
  sendBrowserCollectionControl,
  syncBrowserCollectionAlert,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { useCoupangCatalogImport } from '../hooks/useCoupangCatalogImport';
import {
  buildCoupangCatalogProgress,
  resolveCoupangCatalogError,
} from '../lib/coupang-catalog-progress';
import { channelListingsApi } from '../lib/channel-listings-api';

export function CoupangCatalogImportPanel() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => channelListingsApi.listAccounts(),
    staleTime: 60_000,
  });
  const coupangAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.channel === 'coupang'),
    [accountsQuery.data],
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [linkedRunId] = useState(readCollectionRunId);
  const catalogImport = useCoupangCatalogImport(selectedAccountId, linkedRunId);
  const completedToastRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedAccountId || coupangAccounts.length === 0) return;
    const resumed = catalogImport.activeRun
      ? coupangAccounts.find((account) => account.id === catalogImport.activeRun?.channelAccountId)
      : null;
    const preferred = resumed ?? coupangAccounts.find((account) => account.isPrimary) ?? coupangAccounts[0];
    setSelectedAccountId(preferred.id);
  }, [catalogImport.activeRun, coupangAccounts, selectedAccountId]);

  useEffect(() => {
    const status = catalogImport.serverStatus;
    if (status?.status !== 'completed' || completedToastRef.current === status.id) return;
    completedToastRef.current = status.id;
    toast.success('쿠팡 상품 수집과 DB 반영이 완료되었습니다.');
  }, [catalogImport.serverStatus]);

  const server = catalogImport.serverStatus;
  const extension = catalogImport.extensionStatus;
  const collectionSession = catalogImport.collectionSession.data;
  const isComplete = server?.status === 'completed';
  const isRunning = server?.status === 'running' && extension?.status === 'running';
  const browserActive =
    collectionSession?.status === 'running' ||
    collectionSession?.status === 'attention_required';
  const isCollecting = browserActive || isRunning;
  const canResume = server?.status === 'running' &&
    (!extension || extension.status === 'idle' || extension.status === 'error' || extension.status === 'cancelled');
  const progress = server ? buildCoupangCatalogProgress(server, Date.now()) : null;
  const error = resolveCoupangCatalogError({
    browserActive,
    extensionError: extension?.error ?? null,
    startError: errorMessage(catalogImport.startError),
    serverError: server?.error?.message ?? null,
  });

  const handleStart = async () => {
    try {
      await catalogImport.start();
      toast.success(canResume ? '쿠팡 상품 수집을 재개했습니다.' : '쿠팡 상품 수집을 시작했습니다.');
    } catch (cause) {
      toast.error(errorMessage(cause) || '쿠팡 상품 수집을 시작하지 못했습니다.');
    }
  };

  const handleStop = async () => {
    const runId = collectionSession?.runId ?? server?.id ?? catalogImport.activeRun?.runId;
    if (!runId || isStopping) return;
    setIsStopping(true);
    try {
      const response = await sendBrowserCollectionControl(
        runId,
        'cancelCollectionSession',
      );
      if (response?.status === 'cancelled') {
        updateBrowserCollectionSessionCache(queryClient, response);
        await syncBrowserCollectionAlert(response);
        toast.success('쿠팡 상품 수집을 중단했습니다.');
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.browserCollection.session(runId),
        });
        toast.success('쿠팡 상품 수집 중단을 요청했습니다.');
      }
    } catch (cause) {
      toast.error(errorMessage(cause) || '쿠팡 상품 수집을 중단하지 못했습니다.');
    } finally {
      setIsStopping(false);
    }
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
                  {phaseLabel(server.phase)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              Wing의 상품·옵션·이미지를 DB에 순차 반영하고 완료 후 목록을 갱신합니다.
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
            {server?.status === 'running' && progress && progress.percent > 0 && (
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
            disabled={isRunning || catalogImport.isStarting || coupangAccounts.length === 0}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {coupangAccounts.length === 0 && <option value="">쿠팡 계정 없음</option>}
            {coupangAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          {isCollecting ? (
            <>
              <button
                type="button"
                disabled
                className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-100 px-3 text-xs font-bold text-emerald-700"
              >
                <Loader2 size={13} className="animate-spin" />
                {collectionSession?.status === 'attention_required' ? '확인 필요' : '수집 중'}
              </button>
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={isStopping}
                className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {isStopping && <Loader2 size={13} className="animate-spin" />}
                수집 중단
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={!selectedAccountId || catalogImport.isStarting}
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
        </div>
        {collectionSession && (
          <BrowserCollectionRunControls
            session={collectionSession}
            onWebRestart={handleStart}
            className="basis-full"
            showCancel={false}
          />
        )}
      </div>
    </section>
  );
}

function readCollectionRunId(): string | null {
  if (typeof window === 'undefined') return null;
  const parsed = BrowserCollectionRunIdSchema.safeParse(
    new URLSearchParams(window.location.search).get('collectionRun'),
  );
  return parsed.success ? parsed.data : null;
}

function phaseLabel(phase: string): string {
  if (phase === 'discovery') return '상품 목록 확인';
  if (phase === 'hydration') return '상품 상세 수집 · 카드 반영 중';
  if (phase === 'ready_to_finalize') return 'DB 반영 준비';
  if (phase === 'publishing') return 'DB 반영 중';
  return '완료';
}

function errorMessage(value: unknown): string | null {
  return value instanceof Error ? value.message : null;
}
