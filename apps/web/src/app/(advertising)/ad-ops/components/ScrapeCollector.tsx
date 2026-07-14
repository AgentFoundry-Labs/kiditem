'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrowserCollectionRunIdSchema, type BrowserCollectionProducer } from '@kiditem/shared/browser-collection-session';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Trash2, ExternalLink, Loader2, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { runReadinessExtensionCollection } from '@/components/readiness/readiness-extension-collection';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { apiClient } from '@/lib/api-client';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime } from '@/lib/utils';

interface ScrapeTarget {
  id: string;
  url: string;
  label: string;
  category: string;
  lastScrapedAt: string | null;
}

interface ScrapeResult {
  url?: string;
  label?: string;
  success: boolean;
  count?: number;
  error?: string;
}

const AD_SYNC_URL = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';

export default function ScrapeCollector({ onComplete }: { onComplete?: () => void }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const queryRunResult = BrowserCollectionRunIdSchema.safeParse(
    searchParams.get('collectionRun'),
  );
  const queryRunId = queryRunResult.success ? queryRunResult.data : null;
  const [open, setOpen] = useState(Boolean(queryRunId));
  const [loading, setLoading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'connected' | 'not_found'>('checking');
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);
  const [runId, setRunId] = useState<string | null>(queryRunId);
  const collectionSession = useBrowserCollectionSession(runId);

  useEffect(() => {
    if (!queryRunId) return;
    setRunId(queryRunId);
    setOpen(true);
  }, [queryRunId]);

  const { data: targets = [], refetch: refetchTargets } = useQuery({
    queryKey: queryKeys.ads.scrapeTargets(),
    queryFn: () => apiClient.get<ScrapeTarget[]>('/api/ads/scrape-targets'),
    enabled: open,
  });

  const findExtensionId = useCallback(async (): Promise<string | null> => {
    if (extensionId) return extensionId;
    const detectedExtensionId = await detectExtensionId();
    if (!detectedExtensionId) {
      setExtensionStatus('not_found');
      return null;
    }
    setExtensionId(detectedExtensionId);
    setExtensionStatus('connected');
    return detectedExtensionId;
  }, [extensionId]);

  const openModal = async () => {
    setOpen(true);
    setResults(null);
    setExtensionStatus('checking');
    findExtensionId().catch(() => setExtensionStatus('not_found'));
  };

  const addUrl = async () => {
    if (!newUrl.trim()) return;
    await apiClient.post('/api/ads/scrape-targets', {
      url: newUrl.trim(),
      label: newLabel.trim() || undefined,
    });
    setNewUrl('');
    setNewLabel('');
    refetchTargets();
  };

  const removeUrl = async (id: string) => {
    await apiClient.delete(`/api/ads/scrape-targets/${id}`);
    refetchTargets();
  };

  const collectTargets = async (
    producer: Extract<
      BrowserCollectionProducer,
      'advertising.ad_sync' | 'advertising.scrape_targets'
    >,
  ) => {
    const selectedTargets =
      producer === 'advertising.ad_sync'
        ? [{ id: 'ad-sync', url: AD_SYNC_URL, label: '광고 동기화' }]
        : targets;
    if (selectedTargets.length === 0) return;
    setLoading(true);
    setResults(null);

    const eid = await findExtensionId();
    if (!eid) {
      const missing = await recordMissingBrowserCollection(producer, {
        targetCount: selectedTargets.length,
        trigger: 'ad_ops',
      });
      setRunId(missing.runId);
      setLoading(false);
      setResults([{ success: false, error: '익스텐션 연결이 필요합니다.' }]);
      return;
    }

    try {
      const nextRunId = crypto.randomUUID();
      setRunId(nextRunId);
      const check: ReadinessCheck = {
        key: producer === 'advertising.ad_sync' ? 'ad_sync' : 'scrape_targets',
        label: producer === 'advertising.ad_sync' ? '광고 동기화' : '광고 정보 수집',
        status: 'missing',
        detail: '광고센터 백그라운드 수집',
        lastSyncedAt: null,
        count: null,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: selectedTargets.map((target) => target.url),
        referenceDate: null,
        expectedDates: null,
        missingDates: null,
      };
      const session = await runReadinessExtensionCollection({
        check,
        producer,
        extensionId: eid,
        runId: nextRunId,
      });
      setResults(
        selectedTargets.map((target, index) => ({
          url: target.url,
          label: target.label,
          success:
            session.status === 'succeeded' &&
            index < session.progress.completed,
          count: 0,
          error:
            session.status === 'attention_required'
              ? session.attention?.message
              : session.status === 'failed'
                ? session.progress.label ?? '수집 실패'
                : undefined,
        })),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.ads.collectStatus() });
      onComplete?.();
    } catch (e) {
      setResults([{ success: false, error: e instanceof Error ? e.message : '익스텐션 통신 실패' }]);
    } finally {
      setLoading(false);
    }
  };

  const startCollect = () => collectTargets('advertising.scrape_targets');

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors"
      >
        <Download size={15} />
        정보 수집
      </button>

      {open && (
        <div className="modal-overlay p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-sm w-full max-w-lg max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-purple-600">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-white" />
                <h2 className="text-lg font-bold text-white">정보 수집</h2>
                <span className="text-[11px] text-purple-100">광고센터 데이터 자동 수집</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[50vh]">
              {/* URL 추가 */}
              <div className="space-y-2">
                <div className="text-sm font-bold text-slate-900">새 URL 추가</div>
                <input
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://advertising.coupang.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
                <div className="flex gap-2">
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="라벨 (예: 메인 캠페인)"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                  />
                  <button onClick={addUrl} className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 shrink-0">
                    <Plus size={14} /> 추가
                  </button>
                </div>
              </div>

              {/* URL 목록 */}
              <div>
                <div className="text-sm font-bold text-slate-900 mb-2">수집 대상 ({targets.length}개)</div>
                {targets.length === 0 ? (
                  <div className="empty-state py-6">등록된 URL이 없습니다</div>
                ) : (
                  <div className="space-y-2">
                    {targets.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 group">
                        <ExternalLink size={13} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-800 truncate">{t.label}</div>
                          <div className="text-[11px] text-slate-400 truncate">{t.url}</div>
                          {t.lastScrapedAt && (
                            <div className="text-[10px] text-emerald-500 mt-0.5">마지막: {formatDateTime(t.lastScrapedAt)}</div>
                          )}
                        </div>
                        <button onClick={() => removeUrl(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 수집 결과 */}
            {collectionSession.data && (
              <div className="border-t px-6 py-3">
                <BrowserCollectionRunControls
                  session={collectionSession.data}
                  onWebRestart={(session) =>
                    collectTargets(
                      session.producer === 'advertising.ad_sync'
                        ? 'advertising.ad_sync'
                        : 'advertising.scrape_targets',
                    )
                  }
                />
              </div>
            )}
            {results && (
              <div className="px-6 py-3 bg-slate-50 border-t space-y-1.5">
                <div className="text-xs font-bold text-slate-700">수집 결과</div>
                {results.map((r, i) => (
                  <div key={i} className={cn('flex items-center gap-2 text-[12px]', r.success ? 'text-emerald-700' : 'text-red-600')}>
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                      {r.success ? '성공' : '실패'}
                    </span>
                    <span className="font-medium truncate">{r.label || r.url?.substring(0, 40)}</span>
                    {r.success && (r.count ?? 0) > 0 && <span className="text-slate-400 shrink-0">({r.count}건)</span>}
                    {!r.success && r.error && <span className="text-red-400 truncate">&mdash; {r.error}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 하단 */}
            <div className="px-6 py-4 border-t bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', extensionStatus === 'connected' ? 'bg-emerald-400' : extensionStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-400')} />
                  <span className="text-[12px] text-slate-500">
                    {extensionStatus === 'connected' ? '익스텐션 연결됨' : extensionStatus === 'checking' ? '확인 중...' : '익스텐션 미감지'}
                  </span>
                </div>
                {extensionStatus === 'not_found' && (
                  <span className="text-[11px] text-amber-600">팝업에서 &quot;대시보드 연동 등록&quot; 클릭</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">익스텐션이 URL을 열고 자동 수집합니다</span>
                <button
                  onClick={startCollect}
                  disabled={targets.length === 0 || loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" /> 수집 중...</>
                  ) : (
                    <><Download size={15} /> 전체 수집 ({targets.length}개)</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
