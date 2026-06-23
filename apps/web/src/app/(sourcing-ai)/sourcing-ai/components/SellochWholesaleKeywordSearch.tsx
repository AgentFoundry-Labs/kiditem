'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Loader2, PackageSearch, RefreshCw, Search } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import {
  build1688SearchUrl,
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  type CoupangImageSearchRow,
} from '../lib/coupang-1688-matching';
import {
  get1688KeywordSearchStatus,
  search1688ByKeyword,
  type Search1688KeywordResponse,
} from '../lib/1688-keyword-search-api';
import { append1688NewProductSnapshot } from '../lib/1688-new-product-snapshot';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import {
  addSourcingInterestTarget,
  createKeywordInterestTarget,
  loadLatestInterestTrackingPayload,
  removeSourcingInterestTarget,
  type SourcingInterestTrackingSnapshotPayload,
} from '../lib/sourcing-interest-tracking';
import { InterestKeywordManager } from '../keywords/components/InterestKeywordManager';
import { SellochWholesaleOfferGrid } from './SellochWholesaleOfferGrid';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

const AUTO_KEYWORD_SEARCH_LIMIT = 6;
const KEYWORD_SEARCH_RESULT_LIMIT = 6;
const INLINE_KEYWORD_RESULT_LIMIT = 6;
const DEFAULT_KEYWORD_TARGET_SALE_PRICE_KRW = 15900;

type TodayRecommendationSnapshotPayload = Record<string, unknown> & {
  result?: {
    rows?: TodayRecommendationRow[];
  };
};

type KeywordSearchState =
  | { status: 'loading' }
  | { status: 'success'; result: Search1688KeywordResponse }
  | { status: 'error'; message: string };

type KeywordSearchAvailability =
  | { status: 'checking' }
  | { status: 'ready'; configured: boolean }
  | { status: 'error'; message: string };

interface KeywordSearchCandidate {
  id: string;
  searchQuery: string;
  searchUrl: string;
  sourceLabel: string;
  targetSalePriceKrw: number;
}

export function SellochWholesaleKeywordSearch() {
  const localRows = useTodayRecommendationRows();
  const [snapshotRows, setSnapshotRows] = useState<TodayRecommendationRow[]>([]);
  const [keywordSearches, setKeywordSearches] = useState<Record<string, KeywordSearchState>>({});
  const [availability, setAvailability] = useState<KeywordSearchAvailability>({ status: 'checking' });
  const [interestPayload, setInterestPayload] = useState<SourcingInterestTrackingSnapshotPayload | null>(null);
  const [loadingInterestKeywords, setLoadingInterestKeywords] = useState(false);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [newKeywordText, setNewKeywordText] = useState('');
  const autoRequestedQueries = useRef<Set<string>>(new Set());

  const coupangRows = localRows.length > 0 ? localRows : snapshotRows;
  const interestKeywords = useMemo(
    () => (interestPayload?.result.targets ?? [])
      .filter((target) => target.type === 'keyword' && target.keyword)
      .map((target) => target.keyword as string),
    [interestPayload],
  );
  const matches = useMemo(
    () => {
      if (interestKeywords.length > 0) {
        return interestKeywords.slice(0, 12).map((keyword) => ({
          id: `interest:${keyword}`,
          searchQuery: keyword,
          searchUrl: build1688SearchUrl(keyword),
          sourceLabel: '관심 키워드',
          targetSalePriceKrw: DEFAULT_KEYWORD_TARGET_SALE_PRICE_KRW,
        }));
      }

      return dedupeByQuery(buildCoupangImageSearchRows({ coupangRows, limit: 24 }))
        .slice(0, 12)
        .map((match) => ({
          id: `auto:${match.searchQuery}`,
          searchQuery: match.searchQuery,
          searchUrl: match.searchUrl,
          sourceLabel: match.coupangProduct.productName,
          targetSalePriceKrw: match.targetSalePriceKrw,
        }));
    },
    [coupangRows, interestKeywords],
  );
  const usingInterestKeywords = interestKeywords.length > 0;
  const canRunKeywordSearch = availability.status === 'ready' && availability.configured;

  const runKeywordSearch = useCallback(async (match: KeywordSearchCandidate) => {
    if (!canRunKeywordSearch) {
      setKeywordSearches((prev) => ({
        ...prev,
        [match.searchQuery]: {
          status: 'error',
          message: keywordSearchUnavailableMessage(availability),
        },
      }));
      return;
    }

    setKeywordSearches((prev) => ({ ...prev, [match.searchQuery]: { status: 'loading' } }));
    try {
      const result = await search1688ByKeyword({
        keyword: match.searchQuery,
        page: 1,
        maxResults: KEYWORD_SEARCH_RESULT_LIMIT,
      });
      void append1688NewProductSnapshot({
        source: '1688_keyword_search',
        keyword: match.searchQuery,
        items: result.items,
      }).catch(() => undefined);
      setKeywordSearches((prev) => ({ ...prev, [match.searchQuery]: { status: 'success', result } }));
    } catch (error) {
      setKeywordSearches((prev) => ({
        ...prev,
        [match.searchQuery]: {
          status: 'error',
          message: formatKeywordSearchError(error),
        },
      }));
    }
  }, [availability, canRunKeywordSearch]);

  const rerunTopSearches = useCallback(() => {
    if (!canRunKeywordSearch) return;
    for (const match of matches.slice(0, AUTO_KEYWORD_SEARCH_LIMIT)) {
      autoRequestedQueries.current.add(match.searchQuery);
      void runKeywordSearch(match);
    }
  }, [canRunKeywordSearch, matches, runKeywordSearch]);

  const loadInterestKeywords = useCallback(async () => {
    setLoadingInterestKeywords(true);
    try {
      setInterestPayload(await loadLatestInterestTrackingPayload(3));
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingInterestKeywords(false);
    }
  }, []);

  const registerKeywords = useCallback(async () => {
    const keywords = parseKeywordText(newKeywordText);
    if (keywords.length === 0) return;
    setLoadingInterestKeywords(true);
    setInterestNotice(null);
    try {
      let payload: SourcingInterestTrackingSnapshotPayload | null = null;
      for (const keyword of keywords) {
        payload = await addSourcingInterestTarget({
          target: createKeywordInterestTarget({
            keyword,
            source: 'manual',
          }),
          observation: {
            source: 'manual',
            metrics: {
              label: '1688 검색어 직접 등록',
            },
            note: '1688 키워드검색에서 관심 키워드로 저장',
          },
          trackingWindowDays: 3,
        });
      }
      if (payload) setInterestPayload(payload);
      setNewKeywordText('');
      setInterestNotice(`${formatNumber(keywords.length)}개 키워드를 관심 키워드에 등록했습니다.`);
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingInterestKeywords(false);
    }
  }, [newKeywordText]);

  const removeKeywordInterest = useCallback(async (targetId: string) => {
    setLoadingInterestKeywords(true);
    setInterestNotice(null);
    try {
      const payload = await removeSourcingInterestTarget({
        targetId,
        trackingWindowDays: 3,
      });
      setInterestPayload(payload);
      setInterestNotice('관심 키워드를 삭제했습니다.');
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingInterestKeywords(false);
    }
  }, []);

  const runManagedKeywordSearch = useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;
    void runKeywordSearch(buildKeywordCandidate(normalizedKeyword, '관심 키워드'));
  }, [runKeywordSearch]);

  useEffect(() => {
    if (!canRunKeywordSearch) return;
    for (const match of matches.slice(0, AUTO_KEYWORD_SEARCH_LIMIT)) {
      if (autoRequestedQueries.current.has(match.searchQuery)) continue;
      autoRequestedQueries.current.add(match.searchQuery);
      void runKeywordSearch(match);
    }
  }, [canRunKeywordSearch, matches, runKeywordSearch]);

  useEffect(() => {
    void loadInterestKeywords();
  }, [loadInterestKeywords]);

  useEffect(() => {
    let active = true;
    void get1688KeywordSearchStatus()
      .then((status) => {
        if (active) setAvailability({ status: 'ready', configured: status.configured });
      })
      .catch((error) => {
        if (active) setAvailability({ status: 'error', message: formatKeywordSearchError(error) });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (localRows.length > 0) return () => {
      active = false;
    };

    void getTodaySourcingWorkspaceSnapshot<TodayRecommendationSnapshotPayload>('today_recommendations')
      .then(({ snapshot }) => {
        const rows = snapshot?.payload?.result?.rows;
        if (active && Array.isArray(rows)) setSnapshotRows(rows);
      })
      .catch(() => {
        if (active) setSnapshotRows([]);
      });

    return () => {
      active = false;
    };
  }, [localRows.length]);

  const loadingSearchCount = matches.filter((match) => keywordSearches[match.searchQuery]?.status === 'loading').length;

  return (
    <section className="rounded-[18px] border border-[#eef1f5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#f5f3ff] px-3 text-xs font-black text-[#6d5dfc]">
            <PackageSearch size={14} />
            1688 키워드검색
          </div>
          <h2 className="mt-3 text-xl font-black text-[#111827]">중국어 검색어로 1688 상품 후보 찾기</h2>
          <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-[#667085]">
            관심 키워드 관리에 등록한 중국어 검색어를 우선 사용하고, 등록 키워드가 없으면 쿠팡 후보에서 자동 생성한 검색어로 1688 상품을 찾습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={rerunTopSearches}
          disabled={!canRunKeywordSearch || matches.length === 0 || loadingSearchCount > 0}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-4 text-xs font-black text-[#4b5563] transition hover:border-[#6d5dfc] hover:text-[#6d5dfc] disabled:opacity-60"
        >
          {loadingSearchCount > 0 ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          상위 {AUTO_KEYWORD_SEARCH_LIMIT}개 다시 검색
        </button>
      </div>

      {!canRunKeywordSearch && (
        <KeywordSearchSetupNotice availability={availability} />
      )}

      <div className="mt-5 rounded-xl border border-[#eef1f5] bg-[#fbfcfe] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-black text-[#667085]">1688 중국어 키워드 등록</span>
            <textarea
              value={newKeywordText}
              onChange={(event) => setNewKeywordText(event.target.value)}
              rows={2}
              placeholder="解压玩具捏捏乐, 儿童水枪玩具, 儿童笔袋文具盒"
              className="mt-2 min-h-20 w-full resize-none rounded-lg border border-[#dbe2ea] bg-white px-3 py-2 text-sm font-bold leading-6 text-[#111827] outline-none transition placeholder:text-[#a3adbd] focus:border-[#6d5dfc] focus:ring-2 focus:ring-[#6d5dfc]/10"
            />
          </label>
          <button
            type="button"
            onClick={() => void registerKeywords()}
            disabled={!newKeywordText.trim() || loadingInterestKeywords}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 text-xs font-black text-white transition hover:bg-[#6d5dfc] disabled:cursor-not-allowed disabled:bg-[#dbe2ea] disabled:text-[#8a94a6]"
          >
            {loadingInterestKeywords ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            키워드 등록
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={cn(
            'rounded-md px-2 py-1 text-[11px] font-black',
            usingInterestKeywords ? 'bg-[#eef2ff] text-[#5b50d6]' : 'bg-[#f8fafc] text-[#667085] ring-1 ring-[#eef1f5]',
          )}>
            {usingInterestKeywords ? '관심 키워드 사용 중' : '쿠팡 후보 기반 자동 검색어 사용 중'}
          </span>
          {interestKeywords.slice(0, 6).map((keyword) => (
            <span key={keyword} className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-[#4b5563] ring-1 ring-[#eef1f5]">
              {keyword}
            </span>
          ))}
        </div>

        <InterestKeywordManager
          className="mt-4 border-[#eef1f5] bg-white shadow-none"
          loading={loadingInterestKeywords}
          notice={interestNotice}
          observations={interestPayload?.result.observations ?? []}
          targets={interestPayload?.result.targets ?? []}
          onRefresh={() => void loadInterestKeywords()}
          onRemove={(targetId) => {
            void removeKeywordInterest(targetId);
          }}
          onUseKeyword={runManagedKeywordSearch}
        />
      </div>

      {matches.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#dbe2ea] bg-[#f8fafc] p-6 text-sm font-bold text-[#667085]">
          오늘의 추천 상품이 저장되면 1688 키워드검색 후보가 이곳에 표시됩니다.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {matches.slice(0, AUTO_KEYWORD_SEARCH_LIMIT).map((match) => (
            <KeywordMatchCard
              key={match.id}
              match={match}
              state={keywordSearches[match.searchQuery]}
              onSearch={runKeywordSearch}
              availability={availability}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KeywordMatchCard({
  match,
  state,
  onSearch,
  availability,
}: {
  match: KeywordSearchCandidate;
  state: KeywordSearchState | undefined;
  onSearch: (match: KeywordSearchCandidate) => void;
  availability: KeywordSearchAvailability;
}) {
  const offers = state?.status === 'success'
    ? state.result.items.slice(0, INLINE_KEYWORD_RESULT_LIMIT).map((item) => {
      const offer = buildImageSearchOffer(item, match.targetSalePriceKrw);
      return {
        ...offer,
        monthlySales: item.monthlySales,
        supplierName: item.supplierName,
      };
    })
    : [];
  const isLoading = state?.status === 'loading';
  const disabled = isLoading || availability.status !== 'ready' || !availability.configured;

  return (
    <article className="rounded-xl border border-[#eef1f5] bg-[#fbfcfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#8a94a6]">1688 검색어</p>
          <h3 className="mt-1 truncate text-base font-black text-[#111827]">{match.searchQuery}</h3>
          <p className="mt-1 truncate text-xs font-bold text-[#667085]">{match.sourceLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => onSearch(match)}
          disabled={disabled}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-black text-white transition hover:bg-[#6d5dfc] disabled:bg-[#dbe2ea] disabled:text-[#8a94a6]"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          검색
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {state?.status === 'error' && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-800">{state.message}</p>
        )}
        {isLoading && (
          <p className="rounded-lg border border-[#dbe2ea] bg-white p-3 text-xs font-bold text-[#667085]">1688 상품 후보를 불러오는 중입니다.</p>
        )}
        {state?.status === 'success' && offers.length === 0 && (
          <p className="rounded-lg border border-[#dbe2ea] bg-white p-3 text-xs font-bold text-[#667085]">검색 결과가 없습니다. 다른 검색어로 다시 시도해보세요.</p>
        )}
        {offers.length > 0 && (
          <SellochWholesaleOfferGrid
            offers={offers}
            searchUrl={match.searchUrl}
            density="keyword"
          />
        )}
      </div>
    </article>
  );
}

function KeywordSearchSetupNotice({ availability }: { availability: KeywordSearchAvailability }) {
  const checking = availability.status === 'checking';
  return (
    <div className={cn(
      'mt-5 rounded-xl border p-4',
      checking ? 'border-[#eef1f5] bg-[#f8fafc]' : 'border-red-200 bg-red-50',
    )}>
      <div className="flex items-start gap-3">
        {checking ? (
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[#667085]" />
        ) : (
          <KeyRound size={18} className="mt-0.5 shrink-0 text-red-700" />
        )}
        <div>
          <h3 className="text-sm font-black text-[#111827]">
            {checking ? '1688 키워드검색 연결 확인 중' : '1688 키워드검색 연결 전입니다'}
          </h3>
          <p className={cn('mt-1 text-xs font-bold leading-5', checking ? 'text-[#667085]' : 'text-red-800')}>
            {keywordSearchUnavailableMessage(availability)}
          </p>
        </div>
      </div>
    </div>
  );
}

function buildKeywordCandidate(keyword: string, sourceLabel: string): KeywordSearchCandidate {
  return {
    id: `interest:${keyword}`,
    searchQuery: keyword,
    searchUrl: build1688SearchUrl(keyword),
    sourceLabel,
    targetSalePriceKrw: DEFAULT_KEYWORD_TARGET_SALE_PRICE_KRW,
  };
}

function dedupeByQuery(matches: CoupangImageSearchRow[]): CoupangImageSearchRow[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.searchQuery)) return false;
    seen.add(match.searchQuery);
    return true;
  });
}

function parseKeywordText(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,，]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      if (!keyword || seen.has(keyword)) return false;
      seen.add(keyword);
      return true;
    });
}

function keywordSearchUnavailableMessage(availability: KeywordSearchAvailability): string {
  if (availability.status === 'checking') {
    return '백엔드에서 1688 키워드검색 설정을 확인하고 있습니다.';
  }
  if (availability.status === 'error') {
    return availability.message;
  }
  if (!availability.configured) {
    return '1688 직접 키워드검색 연결이 비활성화되어 있습니다. 서버 설정을 확인해주세요.';
  }
  return '1688 키워드검색을 실행할 수 있습니다.';
}

function formatKeywordSearchError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '1688 키워드검색 중 알 수 없는 오류가 발생했습니다.';
}
