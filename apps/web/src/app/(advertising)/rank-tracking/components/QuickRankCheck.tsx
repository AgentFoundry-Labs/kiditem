'use client';

import { FormEvent, useEffect, useState } from 'react';
import { BrowserCollectionRunIdSchema } from '@kiditem/shared/browser-collection-session';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { formatDateTime } from '@/lib/utils';
import type { SerpItem } from '../lib/rank-api';
import {
  checkCoupangKeywordRank,
  type CheckKeywordRankResponse,
} from '../lib/rank-extension';
import SerpItemsTable from './SerpItemsTable';

const MAX_PAGES_OPTIONS = [1, 2, 3];

/** 단일 키워드 즉시 체크 — 확장이 SERP 를 캡처해 바로 렌더 + 서버 전송. */
export default function QuickRankCheck({
  extensionId,
  disabledReason,
  onPosted,
}: {
  extensionId: string | null;
  disabledReason: string | null;
  onPosted: (keyword: string) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [maxPages, setMaxPages] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckKeywordRankResponse | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [linkedRunId] = useState(readCollectionRunId);
  const collectionSessionQuery = useBrowserCollectionSession(
    runId ?? linkedRunId,
  );
  const collectionSession =
    collectionSessionQuery.data?.producer === 'advertising.keyword_rank'
      ? collectionSessionQuery.data
      : null;

  useEffect(() => {
    if (!collectionSession || runId) return;
    setRunId(collectionSession.runId);
  }, [collectionSession, runId]);

  const runKeywordCheck = async (
    nextKeyword: string,
    nextMaxPages: number,
    requestedRunId?: string,
  ) => {
    if (!nextKeyword || loading) return;
    if (!extensionId) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }
    const nextRunId = requestedRunId ?? crypto.randomUUID();
    setRunId(nextRunId);
    setLoading(true);
    try {
      const response = await checkCoupangKeywordRank(extensionId, {
        keyword: nextKeyword,
        maxPages: nextMaxPages,
        runId: nextRunId,
      });
      setRunId(response.runId ?? nextRunId);
      if (response.cancelled) {
        setResult(null);
        return;
      }
      if (response.attentionRequired) {
        setResult(null);
        toast.warning(response.error ?? '쿠팡 확인이 필요합니다.');
        return;
      }
      setResult(response);
      setCheckedAt(new Date());
      if (response.posted && response.keyword) {
        onPosted(response.keyword);
      }
    } catch (err) {
      setResult(null);
      toast.error(err instanceof Error ? err.message : '쿠팡 키워드 순위 수집 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    await runKeywordCheck(trimmed, maxPages);
  };

  const items: SerpItem[] = result?.items ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-900">빠른 순위 확인</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          트래커 등록 없이 지금 쿠팡 검색 결과를 캡처해 확인합니다. 결과는 서버에도 저장됩니다.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 px-5 py-4">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="키워드 입력 후 즉시 확인"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
        />
        <select
          value={maxPages}
          onChange={(event) => setMaxPages(Number(event.target.value))}
          aria-label="스캔 페이지 수"
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
        >
          {MAX_PAGES_OPTIONS.map((pages) => (
            <option key={pages} value={pages}>
              {pages}페이지
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!keyword.trim() || loading || !extensionId}
          title={!extensionId ? (disabledReason ?? undefined) : undefined}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          확인
        </button>
      </form>

      {collectionSession && (
        <div className="border-t border-slate-100 px-5 py-3">
          <BrowserCollectionRunControls
            session={collectionSession}
            onWebRestart={(session) =>
              runKeywordCheck(keyword.trim(), maxPages, session.runId)
            }
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin text-purple-600" />
          쿠팡 검색 페이지를 열어 순위를 수집하는 중입니다… (최대 2분)
        </div>
      )}

      {!loading && result && (
        <div className="border-t border-slate-100">
          <div className="flex items-center gap-2 px-5 py-2.5 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">&lsquo;{result.keyword}&rsquo;</span>
            <span className="tabular-nums">{items.length}개 상품 · {result.pagesScanned ?? 0}페이지</span>
            {checkedAt && <span className="tabular-nums">{formatDateTime(checkedAt)}</span>}
            {result.posted ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">서버 저장됨</span>
            ) : (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-500">미저장 (로그인 토큰 없음)</span>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <SerpItemsTable items={items} ownVendorItemIds={[]} />
          </div>
        </div>
      )}
    </div>
  );
}

function readCollectionRunId(): string | null {
  if (typeof window === 'undefined') return null;
  const parsed = BrowserCollectionRunIdSchema.safeParse(
    new URLSearchParams(window.location.search).get('collectionRun'),
  );
  return parsed.success ? parsed.data : null;
}
