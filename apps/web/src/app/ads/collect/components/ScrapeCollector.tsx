'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Trash2, ExternalLink, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

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

function sendToExtension(id: string, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const chrome = (window as any).chrome;
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome API 미지원'));
        return;
      }
      chrome.runtime.sendMessage(id, message, (response: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export default function ScrapeCollector({ onComplete }: { onComplete?: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'connected' | 'not_found'>('checking');
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);

  const { data: targets = [], refetch: refetchTargets } = useQuery({
    queryKey: queryKeys.ads.scrapeTargets(),
    queryFn: () => apiClient.get<ScrapeTarget[]>('/api/ads/scrape-targets'),
    enabled: open,
  });

  const findExtensionId = useCallback(async (): Promise<string | null> => {
    if (extensionId) return extensionId;
    const storedId = typeof window !== 'undefined' ? localStorage.getItem('kiditem-ext-id') : null;
    if (!storedId) { setExtensionStatus('not_found'); return null; }
    try {
      const result = await sendToExtension(storedId, { action: 'ping' });
      if (result?.success) {
        setExtensionId(storedId);
        setExtensionStatus('connected');
        return storedId;
      }
    } catch { /* */ }
    setExtensionStatus('not_found');
    return null;
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

  const startCollect = async () => {
    if (targets.length === 0) return;
    setLoading(true);
    setResults(null);

    const eid = await findExtensionId();
    if (!eid) {
      // 폴백: 새 탭으로 열기
      for (const t of targets) {
        window.open(t.url, '_blank');
        await new Promise(r => setTimeout(r, 1000));
      }
      setLoading(false);
      setResults(targets.map(t => ({ url: t.url, label: t.label, success: true, count: 0, error: '탭으로 열림 (수동 확인)' })));
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ads.collectStatus() });
        onComplete?.();
      }, 5000);
      return;
    }

    try {
      const result = await sendToExtension(eid, {
        action: 'scrapeTargets',
        urls: targets.map(t => ({ id: t.id, url: t.url, label: t.label })),
      });
      setResults(result.results || []);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ads.collectStatus() });
        onComplete?.();
      }, 2000);
    } catch (e) {
      setResults([{ success: false, error: e instanceof Error ? e.message : '익스텐션 통신 실패' }]);
    }

    setLoading(false);
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-bold hover:shadow-lg hover:shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <Download size={15} />
        정보 수집
      </button>

      {open && (
        <div className="modal-overlay p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-white" />
                <h2 className="text-lg font-bold text-white">정보 수집</h2>
                <span className="text-[11px] text-blue-200">광고센터 데이터 자동 수집</span>
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
                            <div className="text-[10px] text-emerald-500 mt-0.5">마지막: {new Date(t.lastScrapedAt).toLocaleString('ko-KR')}</div>
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
            {results && (
              <div className="px-6 py-3 bg-slate-50 border-t space-y-1.5">
                <div className="text-xs font-bold text-slate-700">수집 결과</div>
                {results.map((r, i) => (
                  <div key={i} className={cn('flex items-center gap-2 text-[12px]', r.success ? 'text-emerald-700' : 'text-red-600')}>
                    <span>{r.success ? '\u2705' : '\u274c'}</span>
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-bold hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
