'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  sourcingWingCatalogKeywordIdentity,
  type Sourcing1688SearchObservation,
} from '@kiditem/shared/sourcing';
import { KeyRound, Loader2, PackageSearch, RefreshCw, Search } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  build1688SearchUrl,
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  type CoupangImageSearchRow,
} from '../lib/coupang-1688-matching';
import { createKeywordInterestTarget } from '../lib/sourcing-interest-target';
import { toTodayRecommendationRows } from '../lib/sourcing-recommendation-presenter';
import { normalizeWingOperationKeywords } from '../lib/wing-operation-input';
import {
  useRemoveSourcingInterestTarget,
  useSaveSourcingInterestTarget,
  useSourcingInterestTargets,
  useSourcingRecommendations,
} from '../hooks/use-sourcing-workspace';
import { InterestKeywordManager } from '../keywords/components/InterestKeywordManager';
import { useSourcingOperationAction } from '../hooks/use-sourcing-operation-action';
import { useWholesale1688Results } from '../hooks/use-wholesale-1688-results';
import { wholesale1688ResultsQueryKey } from '../lib/wholesale-1688-results-api';
import { SourcingOperationRunPanel } from './SourcingOperationRunPanel';
import { SellochWholesaleOfferGrid } from './SellochWholesaleOfferGrid';

const AUTO_KEYWORD_SEARCH_LIMIT = 6;
const INLINE_KEYWORD_RESULT_LIMIT = 6;
const DEFAULT_KEYWORD_TARGET_SALE_PRICE_KRW = 15900;

interface KeywordSearchCandidate {
  id: string;
  searchQuery: string;
  searchUrl: string;
  sourceLabel: string;
  targetSalePriceKrw: number;
}

export function SellochWholesaleKeywordSearch() {
  const recommendationsQuery = useSourcingRecommendations('today');
  const coupangRows = useMemo(
    () => toTodayRecommendationRows(recommendationsQuery.data?.data?.items ?? []),
    [recommendationsQuery.data],
  );
  const interestTargetsQuery = useSourcingInterestTargets();
  const saveInterestTarget = useSaveSourcingInterestTarget();
  const removeInterestTarget = useRemoveSourcingInterestTarget();
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [newKeywordText, setNewKeywordText] = useState('');

  const interestKeywords = useMemo(
    () => (interestTargetsQuery.data ?? [])
      .filter((target) => target.targetType === 'keyword' && target.keyword)
      .map((target) => target.keyword as string),
    [interestTargetsQuery.data],
  );
  const loadingInterestKeywords =
    interestTargetsQuery.isLoading ||
    interestTargetsQuery.isFetching ||
    saveInterestTarget.isPending ||
    removeInterestTarget.isPending;
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
  const operationKeywords = useMemo(
    () => normalizeWingOperationKeywords(
      matches.map((match) => match.searchQuery),
      AUTO_KEYWORD_SEARCH_LIMIT,
    ),
    [matches],
  );
  const resultQuery = useWholesale1688Results({ keywords: operationKeywords });
  const snapshotQueryKey = wholesale1688ResultsQueryKey({
    keywords: operationKeywords,
  });
  const operationInput = useMemo(
    () => ({ keywords: operationKeywords }),
    [operationKeywords],
  );
  const operation = useSourcingOperationAction({
    operationKey: 'sourcing.search_1688_keyword_batch',
    input: operationInput,
    snapshotQueryKey,
  });
  const operationActive = operation.isStarting || isActiveOperation(operation.run?.status);
  const observationsByKeyword = useMemo(
    () => new Map(
      (resultQuery.data?.observations ?? [])
        .filter((observation) => observation.targetId === null)
        .map((observation) => [
          sourcingWingCatalogKeywordIdentity(observation.keyword),
          observation,
        ]),
    ),
    [resultQuery.data?.observations],
  );

  const runKeywordSearch = useCallback((match: KeywordSearchCandidate) => {
    void operation.start({ keywords: [match.searchQuery] }, [snapshotQueryKey]);
  }, [operation, snapshotQueryKey]);

  const rerunTopSearches = useCallback(() => {
    if (operationKeywords.length === 0) return;
    void operation.start();
  }, [operation, operationKeywords.length]);

  const loadInterestKeywords = useCallback(async () => {
    setInterestNotice(null);
    try {
      const result = await interestTargetsQuery.refetch();
      if (result.error) throw result.error;
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  }, [interestTargetsQuery]);

  const registerKeywords = useCallback(async () => {
    const keywords = parseKeywordText(newKeywordText);
    if (keywords.length === 0) return;
    setInterestNotice(null);
    try {
      for (const keyword of keywords) {
        await saveInterestTarget.mutateAsync(
          createKeywordInterestTarget({ keyword, source: 'manual' }),
        );
      }
      await interestTargetsQuery.refetch();
      setNewKeywordText('');
      setInterestNotice(`${formatNumber(keywords.length)}개 키워드를 관심 키워드에 등록했습니다.`);
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  }, [interestTargetsQuery, newKeywordText, saveInterestTarget]);

  const removeKeywordInterest = useCallback(async (targetId: string) => {
    setInterestNotice(null);
    try {
      await removeInterestTarget.mutateAsync(targetId);
      await interestTargetsQuery.refetch();
      setInterestNotice('관심 키워드를 삭제했습니다.');
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  }, [interestTargetsQuery, removeInterestTarget]);

  const runManagedKeywordSearch = useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;
    void runKeywordSearch(buildKeywordCandidate(normalizedKeyword, '관심 키워드'));
  }, [runKeywordSearch]);

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
          disabled={operationKeywords.length === 0 || operationActive}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dbe2ea] bg-[#fbfbfc] px-4 text-xs font-black text-[#4b5563] transition hover:border-[#6d5dfc] hover:text-[#6d5dfc] disabled:opacity-60"
        >
          {operationActive ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          상위 {AUTO_KEYWORD_SEARCH_LIMIT}개 검색
        </button>
      </div>

      <SourcingOperationRunPanel
        run={operation.run}
        onCancel={() => { void operation.cancel(); }}
        onRetryAttention={() => { void operation.retryAttention(); }}
        isCancelling={operation.isCancelling}
        isRetrying={operation.isRetrying}
        className="mt-5"
      />

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
          targets={interestTargetsQuery.data ?? []}
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
              observation={observationsByKeyword.get(
                sourcingWingCatalogKeywordIdentity(match.searchQuery),
              )}
              onSearch={runKeywordSearch}
              busy={operationActive}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KeywordMatchCard({
  match,
  observation,
  onSearch,
  busy,
}: {
  match: KeywordSearchCandidate;
  observation: Sourcing1688SearchObservation | undefined;
  onSearch: (match: KeywordSearchCandidate) => void;
  busy: boolean;
}) {
  const offers = observation
    ? observation.items.slice(0, INLINE_KEYWORD_RESULT_LIMIT).map((item) => {
      const offer = buildImageSearchOffer(item, match.targetSalePriceKrw);
      return {
        ...offer,
        monthlySales: item.monthlySales,
        supplierName: item.supplierName,
      };
    })
    : [];

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
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-black text-white transition hover:bg-[#6d5dfc] disabled:bg-[#dbe2ea] disabled:text-[#8a94a6]"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          검색
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {busy && !observation && (
          <p className="rounded-lg border border-[#dbe2ea] bg-white p-3 text-xs font-bold text-[#667085]">1688 상품 후보를 불러오는 중입니다.</p>
        )}
        {!busy && !observation && (
          <p className="rounded-lg border border-dashed border-[#dbe2ea] bg-white p-3 text-xs font-bold text-[#667085]">아직 저장된 검색 결과가 없습니다.</p>
        )}
        {observation && offers.length === 0 && (
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

function isActiveOperation(status: string | undefined): boolean {
  return status === 'queued' || status === 'running' || status === 'attention_required';
}
