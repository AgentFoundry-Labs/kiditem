'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, Loader2, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  compareNaverDatalabSearchTrends,
  searchNaverAutocompleteKeywords,
  searchNaverRelatedKeywords,
  searchNaverDatalabPopularKeywords,
  type NaverAutocompleteKeyword,
  type NaverDatalabDevice,
  type NaverDatalabGender,
  type NaverDatalabKeywordTrend,
  type NaverDatalabPopularKeywordBoard,
  type NaverDatalabTimeUnit,
  type NaverRelatedKeyword,
} from '../../recommendations/lib/naver-keyword-api';
import {
  searchCoupangKeywordSuggestions,
  type CoupangKeywordSuggestion,
  type CoupangProductNameToken,
} from '../lib/coupang-keyword-extension';
import {
  buildRankedKeywordPoolSnapshot,
  writeRankedKeywordPool,
} from '../../lib/ranked-keyword-pool';
import { KeywordAnalysisWorkbench } from './KeywordAnalysisWorkbench';
import { EmptyState, PopularKeywordCard } from './KeywordAnalysisPopularBoard';
import { TrendComparePanel } from './KeywordAnalysisTrendPanel';
import { TrendKeywordAgentPanel } from './TrendKeywordAgentPanel';
import {
  boardKeys,
  filterLabel,
  matchesFocusMode,
  timeUnitLabel,
  toSearchTrendAges,
  type BoardFilterKey,
  type FocusMode,
} from './keyword-analysis-helpers';
import {
  runTrendKeywordAgent,
  type TrendKeywordAgentResult,
} from '../lib/trend-keyword-agent';
import { writeTrendKeywordAgentResult } from '../lib/trend-keyword-agent-storage';
import {
  createManualSourcingWorkspaceSnapshotMeta,
  getTodaySourcingWorkspaceSnapshot,
  saveTodaySourcingWorkspaceSnapshot,
  type SourcingWorkspaceSnapshotMeta,
} from '../../lib/sourcing-workspace-snapshot-api';

interface CoupangPopularKeyword extends CoupangKeywordSuggestion {
  monthlyTotalSearchCount: number | null;
}

type KeywordAnalysisSnapshotPayload = {
  version: 1;
  input: {
    filters: {
      timeUnit: NaverDatalabTimeUnit;
      gender: 'all' | NaverDatalabGender;
      age: string;
      device: 'all' | NaverDatalabDevice;
      selectedBoardKey: BoardFilterKey;
      rankLimit: string;
      focusMode: FocusMode;
    };
    keywordQuery: string;
    trendText: string;
  };
  result: {
    boards: NaverDatalabPopularKeywordBoard[];
    trendItems: NaverDatalabKeywordTrend[];
    relatedSearchSeed: string | null;
    searchAdRelatedItems: NaverRelatedKeyword[];
    relatedSearchItems: NaverDatalabKeywordTrend[];
    autocompleteItems: NaverAutocompleteKeyword[];
    coupangKeywordItems: CoupangPopularKeyword[];
    coupangProductNameTokens: CoupangProductNameToken[];
    trendAgentResult: TrendKeywordAgentResult | null;
  };
  meta: SourcingWorkspaceSnapshotMeta;
};

export function KeywordAnalysisPage() {
  const [boards, setBoards] = useState<NaverDatalabPopularKeywordBoard[]>([]);
  const [timeUnit, setTimeUnit] = useState<NaverDatalabTimeUnit>('date');
  const [gender, setGender] = useState<'all' | NaverDatalabGender>('all');
  const [age, setAge] = useState('all');
  const [device, setDevice] = useState<'all' | NaverDatalabDevice>('all');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [selectedBoardKey, setSelectedBoardKey] = useState<BoardFilterKey>('all');
  const [rankLimit, setRankLimit] = useState('10');
  const [focusMode, setFocusMode] = useState<FocusMode>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [trendText, setTrendText] = useState('포켓몬카드\n레고\n슬라임\n잔디인형');
  const [trendItems, setTrendItems] = useState<NaverDatalabKeywordTrend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendNotice, setTrendNotice] = useState<string | null>(null);
  const [relatedSearchSeed, setRelatedSearchSeed] = useState<string | null>(null);
  const [searchAdRelatedItems, setSearchAdRelatedItems] = useState<NaverRelatedKeyword[]>([]);
  const [relatedSearchItems, setRelatedSearchItems] = useState<NaverDatalabKeywordTrend[]>([]);
  const [autocompleteItems, setAutocompleteItems] = useState<NaverAutocompleteKeyword[]>([]);
  const [coupangKeywordItems, setCoupangKeywordItems] = useState<CoupangPopularKeyword[]>([]);
  const [coupangProductNameTokens, setCoupangProductNameTokens] = useState<CoupangProductNameToken[]>([]);
  const [loadingSearchAdRelated, setLoadingSearchAdRelated] = useState(false);
  const [loadingRelatedSearch, setLoadingRelatedSearch] = useState(false);
  const [loadingAutocomplete, setLoadingAutocomplete] = useState(false);
  const [loadingCoupangKeywords, setLoadingCoupangKeywords] = useState(false);
  const [searchAdNotice, setSearchAdNotice] = useState<string | null>(null);
  const [relatedSearchNotice, setRelatedSearchNotice] = useState<string | null>(null);
  const [autocompleteNotice, setAutocompleteNotice] = useState<string | null>(null);
  const [coupangKeywordNotice, setCoupangKeywordNotice] = useState<string | null>(null);
  const [trendAgentResult, setTrendAgentResult] = useState<TrendKeywordAgentResult | null>(null);
  const [trendAgentNotice, setTrendAgentNotice] = useState<string | null>(null);
  const [loadingTrendAgent, setLoadingTrendAgent] = useState(false);
  const [showRecentKeywords, setShowRecentKeywords] = useState(true);
  const [dailySnapshotHydrated, setDailySnapshotHydrated] = useState(false);
  const popularRequestIdRef = useRef(0);
  const relatedRequestIdRef = useRef(0);
  const didAutoLoadKeywordAnalysisRef = useRef(false);

  const visibleBoards = useMemo(() => {
    const rankCap = Number(rankLimit);
    return boards
      .filter((board) => selectedBoardKey === 'all' || board.key === selectedBoardKey)
      .filter((board) => matchesFocusMode(board.key, focusMode))
      .map((board) => ({
        ...board,
        ranks: board.ranks.filter((rank) => rank.rank <= rankCap),
      }));
  }, [boards, focusMode, rankLimit, selectedBoardKey]);
  const rows = useMemo(() => visibleBoards.flatMap((board) => board.ranks.map((rank) => ({ board, rank }))), [visibleBoards]);

  const recentKeywords = useMemo(() => {
    const fromBoards = boards.flatMap((board) => board.ranks.map((rank) => rank.keyword));
    return Array.from(new Set([...fromBoards, '포켓몬카드', '레고', '슬라임', '잔디인형'])).slice(0, 4);
  }, [boards]);

  const loadPopularKeywords = async (overrides: Partial<{
    timeUnit: NaverDatalabTimeUnit;
    gender: 'all' | NaverDatalabGender;
    age: string;
    device: 'all' | NaverDatalabDevice;
  }> = {}) => {
    const requestId = popularRequestIdRef.current + 1;
    popularRequestIdRef.current = requestId;
    const nextTimeUnit = overrides.timeUnit ?? timeUnit;
    const nextGender = overrides.gender ?? gender;
    const nextAge = overrides.age ?? age;
    const nextDevice = overrides.device ?? device;

    setLoadingPopular(true);
    setNotice(null);
    try {
      const response = await searchNaverDatalabPopularKeywords({
        boardKeys,
        timeUnit: nextTimeUnit,
        gender: nextGender === 'all' ? undefined : nextGender,
        device: nextDevice === 'all' ? undefined : nextDevice,
        ages: nextAge === 'all' ? undefined : [nextAge],
        limit: 20,
      });
      if (popularRequestIdRef.current !== requestId) return;
      setBoards(response.boards);
      const keywordCount = response.boards.reduce((sum, board) => sum + board.ranks.length, 0);
      const failedCount = response.boards.filter((board) => board.error).length;
      setNotice(
        failedCount > 0
          ? `인기 키워드 ${formatNumber(keywordCount)}개 갱신, ${formatNumber(failedCount)}개 보드는 호출 제한`
          : `인기 키워드 ${formatNumber(keywordCount)}개 갱신 완료`,
      );
    } catch (error) {
      if (popularRequestIdRef.current !== requestId) return;
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (popularRequestIdRef.current === requestId) {
        setLoadingPopular(false);
      }
    }
  };

  const changeTimeUnit = (value: NaverDatalabTimeUnit) => {
    setTimeUnit(value);
    void loadPopularKeywords({ timeUnit: value });
  };

  const changeGender = (value: 'all' | NaverDatalabGender) => {
    setGender(value);
    void loadPopularKeywords({ gender: value });
  };

  const changeAge = (value: string) => {
    setAge(value);
    void loadPopularKeywords({ age: value });
  };

  const changeDevice = (value: 'all' | NaverDatalabDevice) => {
    setDevice(value);
    void loadPopularKeywords({ device: value });
  };

  const compareTrends = async () => {
    const keywords = Array.from(new Set(trendText.split(/\n|,/).map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 5);
    if (keywords.length === 0) {
      setTrendNotice('비교할 키워드를 1개 이상 입력하세요.');
      return;
    }

    setLoadingTrends(true);
    setTrendNotice(null);
    try {
      const response = await compareNaverDatalabSearchTrends({
        keywords,
        timeUnit,
        gender: gender === 'all' ? undefined : gender,
        device: device === 'all' ? undefined : device,
        ages: toSearchTrendAges(age),
      });
      setTrendItems(response.items);
      setTrendNotice(`키워드 ${formatNumber(response.items.length)}개 트렌드 비교 완료`);
    } catch (error) {
      setTrendNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTrends(false);
    }
  };

  const addTrendKeyword = (keyword: string) => {
    setTrendText((current) => {
      const next = [keyword, ...current.split(/\n|,/).map((item) => item.trim()).filter(Boolean)];
      return Array.from(new Set(next)).slice(0, 5).join('\n');
    });
  };

  const loadRelatedKeywordData = async (keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;
    const requestId = relatedRequestIdRef.current + 1;
    relatedRequestIdRef.current = requestId;
    const isCurrentRequest = () => relatedRequestIdRef.current === requestId;

    setRelatedSearchSeed(normalizedKeyword);
    setSearchAdRelatedItems([]);
    setRelatedSearchItems([]);
    setAutocompleteItems([]);
    setCoupangKeywordItems([]);
    setCoupangProductNameTokens([]);
    setSearchAdNotice(null);
    setRelatedSearchNotice(null);
    setAutocompleteNotice(null);
    setCoupangKeywordNotice(null);
    setLoadingSearchAdRelated(true);
    setLoadingRelatedSearch(false);
    setLoadingAutocomplete(true);
    setLoadingCoupangKeywords(true);

    void searchNaverAutocompleteKeywords({
      keyword: normalizedKeyword,
      maxResults: 30,
    })
      .then((response) => {
        if (!isCurrentRequest()) return;
        const items = response.items.filter((item) => item.keyword.trim().length > 0);
        setAutocompleteItems(items);
        setAutocompleteNotice(
          items.length > 0
            ? `네이버 자동완성 키워드 ${formatNumber(items.length)}개를 가져왔습니다.`
            : '네이버 자동완성 키워드가 비어 있습니다.',
        );
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest()) return;
        setAutocompleteItems([]);
        setAutocompleteNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isCurrentRequest()) setLoadingAutocomplete(false);
      });

    void searchCoupangKeywordSuggestions({
      keyword: normalizedKeyword,
      maxResults: 30,
    })
      .then(async (response) => {
        if (!isCurrentRequest()) return;
        const items = (response.items ?? []).filter((item) => item.keyword.trim().length > 0);
        const searchCounts = await fetchSearchCountsForKeywords(items.map((item) => item.keyword).slice(0, 20))
          .catch(() => new Map<string, number | null>());
        if (!isCurrentRequest()) return;
        const enrichedItems = items.map((item) => ({
          ...item,
          monthlyTotalSearchCount: searchCounts.get(compactKeyword(item.keyword)) ?? null,
        }));
        setCoupangKeywordItems(enrichedItems);
        setCoupangProductNameTokens(response.productNameTokens ?? []);
        setCoupangKeywordNotice(
          enrichedItems.length > 0
            ? `쿠팡 검색 페이지에서 인기 키워드 ${formatNumber(enrichedItems.length)}개를 가져오고 검색량을 매칭했습니다.`
            : '쿠팡 인기 키워드가 비어 있습니다.',
        );
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest()) return;
        setCoupangKeywordItems([]);
        setCoupangProductNameTokens([]);
        setCoupangKeywordNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isCurrentRequest()) setLoadingCoupangKeywords(false);
      });

    let relatedItems: NaverRelatedKeyword[] = [];
    try {
      const relatedResponse = await searchNaverRelatedKeywords({
        seedKeywords: [normalizedKeyword],
        maxResults: 30,
      });
      relatedItems = relatedResponse.items
        .filter((item) => item.keyword.trim().length > 0)
        .toSorted(compareSearchAdRelatedKeywords);
      if (!isCurrentRequest()) return;

      setSearchAdRelatedItems(relatedItems);
      setSearchAdNotice(
        relatedItems.length > 0
          ? `SearchAd에서 연관 키워드 ${formatNumber(relatedItems.length)}개를 가져왔습니다.`
          : 'SearchAd 연관 키워드가 비어 있습니다.',
      );
    } catch (error) {
      if (!isCurrentRequest()) return;
      setSearchAdNotice(error instanceof Error ? error.message : String(error));
      return;
    } finally {
      if (isCurrentRequest()) setLoadingSearchAdRelated(false);
    }

    if (relatedItems.length === 0) return;

    setLoadingRelatedSearch(true);
    try {
      const response = await compareNaverDatalabSearchTrends({
        keywords: relatedItems.map((item) => item.keyword),
        timeUnit,
        gender: gender === 'all' ? undefined : gender,
        device: device === 'all' ? undefined : device,
        ages: toSearchTrendAges(age),
      });
      const items = response.items.toSorted(compareDatalabRelatedKeywords);
      if (!isCurrentRequest()) return;
      setRelatedSearchItems(items);
      setRelatedSearchNotice(`SearchAd 키워드 ${formatNumber(items.length)}개를 DataLab 지수로 검증했습니다.`);
    } catch (error) {
      if (!isCurrentRequest()) return;
      setRelatedSearchItems([]);
      setRelatedSearchNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrentRequest()) setLoadingRelatedSearch(false);
    }
  };

  const useKeywordForAnalysis = (keyword: string) => {
    setKeywordQuery(keyword);
    addTrendKeyword(keyword);
    void loadRelatedKeywordData(keyword);
  };

  const runTrendAgent = async () => {
    setLoadingTrendAgent(true);
    setTrendAgentNotice(null);
    try {
      const result = await runTrendKeywordAgent({
        timeUnit,
        gender,
        age,
        device,
        selectedBoardKey,
        rankLimit,
        focusMode,
        cachedBoards: boards,
        finalLimit: 30,
      });
      setTrendAgentResult(result);
      writeTrendKeywordAgentResult(result);
      const topKeywords = result.candidates.slice(0, 5).map((candidate) => candidate.keyword);
      if (topKeywords.length > 0) {
        setTrendText(topKeywords.join('\n'));
        setKeywordQuery(topKeywords[0] ?? '');
      }
      setTrendAgentNotice(
        result.candidates.length > 0
          ? `트렌드 후보 ${formatNumber(result.candidates.length)}개를 골랐습니다. TOP 키워드는 ${result.candidates[0]?.keyword ?? '-'}입니다.`
          : '조건에 맞는 트렌드 후보가 아직 없습니다.',
      );
    } catch (error) {
      setTrendAgentResult(null);
      setTrendAgentNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTrendAgent(false);
    }
  };

  const submitKeywordSearch = () => {
    const keyword = keywordQuery.trim();
    if (!keyword) return;
    addTrendKeyword(keyword);
    void loadRelatedKeywordData(keyword);
  };

  const applyKeywordAnalysisSnapshot = (payload: KeywordAnalysisSnapshotPayload) => {
    setTimeUnit(payload.input.filters.timeUnit);
    setGender(payload.input.filters.gender);
    setAge(payload.input.filters.age);
    setDevice(payload.input.filters.device);
    setSelectedBoardKey(payload.input.filters.selectedBoardKey);
    setRankLimit(payload.input.filters.rankLimit);
    setFocusMode(payload.input.filters.focusMode);
    setBoards(payload.result.boards);
    setKeywordQuery(payload.input.keywordQuery);
    setTrendText(payload.input.trendText);
    setTrendItems(payload.result.trendItems);
    setRelatedSearchSeed(payload.result.relatedSearchSeed);
    setSearchAdRelatedItems(payload.result.searchAdRelatedItems);
    setRelatedSearchItems(payload.result.relatedSearchItems);
    setAutocompleteItems(payload.result.autocompleteItems);
    setCoupangKeywordItems(payload.result.coupangKeywordItems);
    setCoupangProductNameTokens(payload.result.coupangProductNameTokens);
    setTrendAgentResult(payload.result.trendAgentResult);
    if (payload.result.trendAgentResult) writeTrendKeywordAgentResult(payload.result.trendAgentResult);
  };

  useEffect(() => {
    let active = true;
    void getTodaySourcingWorkspaceSnapshot<KeywordAnalysisSnapshotPayload>('keyword_analysis')
      .then(({ snapshot }) => {
        if (!active) return;
        if (isKeywordAnalysisSnapshotPayload(snapshot?.payload)) {
          applyKeywordAnalysisSnapshot(snapshot.payload);
          setNotice(`오늘 ${snapshot.businessDate} 저장된 키워드 분석을 불러왔습니다.`);
        }
        setDailySnapshotHydrated(true);
      })
      .catch(() => {
        if (active) setDailySnapshotHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dailySnapshotHydrated || didAutoLoadKeywordAnalysisRef.current) return;
    didAutoLoadKeywordAnalysisRef.current = true;
    if (boards.length === 0) void loadPopularKeywords();
  }, [dailySnapshotHydrated]);

  useEffect(() => {
    if (visibleBoards.length === 0 || rows.length === 0) return;

    writeRankedKeywordPool(buildRankedKeywordPoolSnapshot({
      boards: visibleBoards,
      filters: {
        timeUnit,
        gender,
        age,
        device,
        boardKey: selectedBoardKey,
        rankLimit,
        focusMode,
      },
      limit: 50,
    }));
  }, [age, device, focusMode, gender, rankLimit, rows.length, selectedBoardKey, timeUnit, visibleBoards]);

  useEffect(() => {
    if (!dailySnapshotHydrated) return;
    if (!hasKeywordAnalysisSnapshotData({
      boards,
      trendItems,
      relatedSearchSeed,
      searchAdRelatedItems,
      relatedSearchItems,
      autocompleteItems,
      coupangKeywordItems,
      coupangProductNameTokens,
      trendAgentResult,
    })) return;

    const handle = window.setTimeout(() => {
      const payload = buildKeywordAnalysisSnapshotPayload({
        boards,
        timeUnit,
        gender,
        age,
        device,
        keywordQuery,
        selectedBoardKey,
        rankLimit,
        focusMode,
        trendText,
        trendItems,
        relatedSearchSeed,
        searchAdRelatedItems,
        relatedSearchItems,
        autocompleteItems,
        coupangKeywordItems,
        coupangProductNameTokens,
        trendAgentResult,
      });
      void saveTodaySourcingWorkspaceSnapshot('keyword_analysis', payload).catch(() => {
        // The visible page state remains usable even if persistence is temporarily unavailable.
      });
    }, 500);

    return () => window.clearTimeout(handle);
  }, [
    age,
    autocompleteItems,
    boards,
    coupangKeywordItems,
    coupangProductNameTokens,
    dailySnapshotHydrated,
    device,
    focusMode,
    gender,
    keywordQuery,
    rankLimit,
    relatedSearchItems,
    relatedSearchSeed,
    searchAdRelatedItems,
    selectedBoardKey,
    timeUnit,
    trendAgentResult,
    trendItems,
    trendText,
  ]);

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-6 py-6">
        <header className="px-4 py-8 text-center">
          <h1 className="inline-block bg-gradient-to-r from-[#7c3cff] via-[#376bff] to-[#00b7ff] bg-clip-text text-5xl font-black tracking-normal text-transparent md:text-6xl">
            키워드 분석
          </h1>
          <div className="mx-auto mt-7 max-w-4xl rounded-full bg-gradient-to-r from-[#7c3cff] to-[#00b7ff] p-[2px] shadow-[0_18px_45px_rgba(47,111,255,0.14)]">
            <div className="flex h-16 items-center rounded-full bg-[var(--surface)] px-7">
              <input
                value={keywordQuery}
                onChange={(event) => setKeywordQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitKeywordSearch();
                }}
                className="h-full min-w-0 flex-1 bg-transparent text-center text-lg font-black text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] md:text-xl"
                placeholder="키워드를 입력해주세요"
              />
              <button
                type="button"
                onClick={submitKeywordSearch}
                className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#06a8ff] transition hover:bg-[#eef8ff]"
                aria-label="키워드 검색"
              >
                <Search size={28} strokeWidth={2.4} />
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-bold text-[var(--text-tertiary)]">최근 검색 키워드</span>
            {showRecentKeywords && recentKeywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => useKeywordForAnalysis(keyword)}
                className="rounded-full bg-[var(--surface)] px-4 py-2 text-xs font-black text-[var(--text-secondary)] shadow-sm transition hover:text-[var(--primary)]"
              >
                {keyword}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowRecentKeywords((current) => !current)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
              aria-label={showRecentKeywords ? '최근 키워드 접기' : '최근 키워드 펼치기'}
            >
              {showRecentKeywords ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          <RelatedKeywordOverview
            className="max-w-[1600px]"
            seed={relatedSearchSeed}
            searchAdItems={searchAdRelatedItems}
            trendItems={relatedSearchItems}
            autocompleteItems={autocompleteItems}
            coupangKeywordItems={coupangKeywordItems}
            coupangProductNameTokens={coupangProductNameTokens}
            loading={loadingSearchAdRelated || loadingRelatedSearch || loadingAutocomplete || loadingCoupangKeywords}
            searchAdNotice={searchAdNotice}
            trendNotice={relatedSearchNotice}
            autocompleteNotice={autocompleteNotice}
            coupangKeywordNotice={coupangKeywordNotice}
            onUseKeyword={useKeywordForAnalysis}
            onSelectKeywords={(keywords) => {
              setTrendText((current) => {
                const next = [...keywords, ...current.split(/\n|,/).map((item) => item.trim()).filter(Boolean)];
                return Array.from(new Set(next)).slice(0, 5).join('\n');
              });
            }}
          />

          <TrendKeywordAgentPanel
            className="mx-auto mt-5 w-full max-w-[1600px] text-left"
            compact
            loading={loadingTrendAgent}
            result={trendAgentResult}
            notice={trendAgentNotice}
            onRun={runTrendAgent}
            onUseKeyword={useKeywordForAnalysis}
            onCompareKeywords={(keywords) => {
              setTrendText(keywords.join('\n'));
            }}
          />
        </header>

        <KeywordAnalysisWorkbench
          timeUnit={timeUnit}
          gender={gender}
          age={age}
          device={device}
          selectedBoardKey={selectedBoardKey}
          rankLimit={rankLimit}
          focusMode={focusMode}
          loading={loadingPopular}
          onTimeUnitChange={changeTimeUnit}
          onGenderChange={changeGender}
          onAgeChange={changeAge}
          onDeviceChange={changeDevice}
          onBoardChange={setSelectedBoardKey}
          onRankLimitChange={setRankLimit}
          onFocusModeChange={setFocusMode}
          onRefresh={() => void loadPopularKeywords()}
        />

        <TrendComparePanel
          value={trendText}
          loading={loadingTrends}
          notice={trendNotice}
          items={trendItems}
          onChange={setTrendText}
          onCompare={compareTrends}
        />

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-[#ff5a1f]" />
                <h2 className="text-lg font-black">인기 트렌드 키워드 보드</h2>
              </div>
              <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-tertiary)]">
                필터 없는 기본 TOP과 완구/문구 중심 보드를 따로 봅니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
                {filterLabel(gender, age)} · {timeUnitLabel(timeUnit)}
              </span>
              <button
                type="button"
                onClick={() => void loadPopularKeywords()}
                disabled={loadingPopular}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-xs font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPopular ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                순위 갱신
              </button>
            </div>
          </div>

          {notice && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
              <Filter size={14} />
              {notice}
            </div>
          )}

          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
            {visibleBoards.length === 0 ? (
              <EmptyState loading={loadingPopular} text="순위 갱신을 누르면 인기 키워드 보드가 표시됩니다." />
            ) : visibleBoards.map((board) => (
              <PopularKeywordCard key={board.key} board={board} disabled={loadingPopular} onUseKeyword={addTrendKeyword} />
            ))}
          </div>
        </section>

        <SourceKeywordGrid
          seed={relatedSearchSeed}
          searchAdItems={searchAdRelatedItems}
          trendItems={relatedSearchItems}
          autocompleteItems={autocompleteItems}
          coupangKeywordItems={coupangKeywordItems}
          coupangProductNameTokens={coupangProductNameTokens}
          loading={loadingSearchAdRelated || loadingRelatedSearch || loadingAutocomplete || loadingCoupangKeywords}
          searchAdNotice={searchAdNotice}
          trendNotice={relatedSearchNotice}
          autocompleteNotice={autocompleteNotice}
          coupangKeywordNotice={coupangKeywordNotice}
          onUseKeyword={useKeywordForAnalysis}
          onSelectKeywords={(keywords) => {
            setTrendText((current) => {
              const next = [...keywords, ...current.split(/\n|,/).map((item) => item.trim()).filter(Boolean)];
              return Array.from(new Set(next)).slice(0, 5).join('\n');
            });
          }}
        />
      </div>
    </main>
  );
}

function buildKeywordAnalysisSnapshotPayload(input: {
  boards: NaverDatalabPopularKeywordBoard[];
  timeUnit: NaverDatalabTimeUnit;
  gender: 'all' | NaverDatalabGender;
  age: string;
  device: 'all' | NaverDatalabDevice;
  keywordQuery: string;
  selectedBoardKey: BoardFilterKey;
  rankLimit: string;
  focusMode: FocusMode;
  trendText: string;
  trendItems: NaverDatalabKeywordTrend[];
  relatedSearchSeed: string | null;
  searchAdRelatedItems: NaverRelatedKeyword[];
  relatedSearchItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: CoupangProductNameToken[];
  trendAgentResult: TrendKeywordAgentResult | null;
}): KeywordAnalysisSnapshotPayload {
  return {
    version: 1,
    input: {
      filters: {
        timeUnit: input.timeUnit,
        gender: input.gender,
        age: input.age,
        device: input.device,
        selectedBoardKey: input.selectedBoardKey,
        rankLimit: input.rankLimit,
        focusMode: input.focusMode,
      },
      keywordQuery: input.keywordQuery,
      trendText: input.trendText,
    },
    result: {
      boards: input.boards,
      trendItems: input.trendItems,
      relatedSearchSeed: input.relatedSearchSeed,
      searchAdRelatedItems: input.searchAdRelatedItems,
      relatedSearchItems: input.relatedSearchItems,
      autocompleteItems: input.autocompleteItems,
      coupangKeywordItems: input.coupangKeywordItems,
      coupangProductNameTokens: input.coupangProductNameTokens,
      trendAgentResult: input.trendAgentResult,
    },
    meta: createManualSourcingWorkspaceSnapshotMeta(),
  };
}

function hasKeywordAnalysisSnapshotData(input: {
  boards: NaverDatalabPopularKeywordBoard[];
  trendItems: NaverDatalabKeywordTrend[];
  relatedSearchSeed: string | null;
  searchAdRelatedItems: NaverRelatedKeyword[];
  relatedSearchItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: CoupangProductNameToken[];
  trendAgentResult: TrendKeywordAgentResult | null;
}): boolean {
  return input.boards.length > 0 ||
    input.trendItems.length > 0 ||
    input.relatedSearchSeed != null ||
    input.searchAdRelatedItems.length > 0 ||
    input.relatedSearchItems.length > 0 ||
    input.autocompleteItems.length > 0 ||
    input.coupangKeywordItems.length > 0 ||
    input.coupangProductNameTokens.length > 0 ||
    input.trendAgentResult != null;
}

function isKeywordAnalysisSnapshotPayload(value: unknown): value is KeywordAnalysisSnapshotPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<KeywordAnalysisSnapshotPayload>;
  const input = payload.input as Partial<KeywordAnalysisSnapshotPayload['input']> | undefined;
  const result = payload.result as Partial<KeywordAnalysisSnapshotPayload['result']> | undefined;
  const filters = input?.filters as Partial<KeywordAnalysisSnapshotPayload['input']['filters']> | undefined;
  const meta = payload.meta as Partial<SourcingWorkspaceSnapshotMeta> | undefined;
  return payload.version === 1 &&
    Boolean(input) &&
    Boolean(result) &&
    Boolean(filters) &&
    isTimeUnit(filters?.timeUnit) &&
    isGenderFilter(filters?.gender) &&
    typeof filters?.age === 'string' &&
    isDeviceFilter(filters?.device) &&
    typeof filters?.selectedBoardKey === 'string' &&
    typeof filters?.rankLimit === 'string' &&
    typeof filters?.focusMode === 'string' &&
    typeof input?.keywordQuery === 'string' &&
    typeof input?.trendText === 'string' &&
    Array.isArray(result?.boards) &&
    Array.isArray(result?.trendItems) &&
    Array.isArray(result?.searchAdRelatedItems) &&
    Array.isArray(result?.relatedSearchItems) &&
    Array.isArray(result?.autocompleteItems) &&
    Array.isArray(result?.coupangKeywordItems) &&
    Array.isArray(result?.coupangProductNameTokens) &&
    typeof meta?.generatedAt === 'string' &&
    typeof meta?.generationSource === 'string' &&
    typeof meta?.generatorVersion === 'string';
}

function isTimeUnit(value: unknown): value is NaverDatalabTimeUnit {
  return value === 'date' || value === 'week' || value === 'month';
}

function isGenderFilter(value: unknown): value is 'all' | NaverDatalabGender {
  return value === 'all' || value === 'm' || value === 'f';
}

function isDeviceFilter(value: unknown): value is 'all' | NaverDatalabDevice {
  return value === 'all' || value === 'pc' || value === 'mo';
}

function RelatedKeywordOverview({
  className,
  seed,
  searchAdItems,
  trendItems,
  autocompleteItems,
  coupangKeywordItems,
  coupangProductNameTokens,
  loading,
  searchAdNotice,
  trendNotice,
  autocompleteNotice,
  coupangKeywordNotice,
  onUseKeyword,
}: {
  className?: string;
  seed: string | null;
  searchAdItems: NaverRelatedKeyword[];
  trendItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: CoupangProductNameToken[];
  loading: boolean;
  searchAdNotice: string | null;
  trendNotice: string | null;
  autocompleteNotice: string | null;
  coupangKeywordNotice: string | null;
  onUseKeyword: (keyword: string) => void;
  onSelectKeywords: (keywords: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const showPanel = loading || Boolean(seed) || searchAdItems.length > 0 || trendItems.length > 0 || autocompleteItems.length > 0 || coupangKeywordItems.length > 0 || coupangProductNameTokens.length > 0;
  if (!showPanel) return null;

  const trendMap = new Map(trendItems.map((item) => [compactKeyword(item.keyword), item]));
  const groups = [
    {
      title: '상품명분석',
      caption: '쿠팡 상품명 토큰',
      items: coupangProductNameTokens.slice(0, 10).map((item) => ({ keyword: item.keyword, meta: `${formatNumber(item.count)}회` })),
      emptyText: problemNotice(coupangKeywordNotice) ?? '쿠팡 상품명 토큰이 수집되면 표시됩니다.',
    },
    {
      title: '인기키워드',
      caption: 'SearchAd 실제 검색량',
      items: searchAdItems.slice(0, 10).map((item) => ({
        keyword: item.keyword,
        meta: item.monthlyTotalSearchCount == null ? '-' : `월 ${formatNumber(item.monthlyTotalSearchCount)}회`,
      })),
      emptyText: problemNotice(searchAdNotice) ?? 'SearchAd 연관 검색량이 있으면 표시됩니다.',
    },
    {
      title: '쿠팡 인기검색어',
      caption: 'COUPANG 검색 후보',
      items: coupangKeywordItems.slice(0, 10).map((item) => ({
        keyword: item.keyword,
        meta: item.monthlyTotalSearchCount == null ? `#${formatNumber(item.rank)}` : `월 ${formatNumber(item.monthlyTotalSearchCount)}회`,
      })),
      emptyText: problemNotice(coupangKeywordNotice) ?? '쿠팡 검색 페이지에서 인기 키워드를 가져오면 표시됩니다.',
    },
    {
      title: '연관키워드',
      caption: 'DataLab 트렌드 검증',
      items: trendItems.slice(0, 10).map((item) => ({
        keyword: item.keyword,
        meta: `최근 지수 ${formatDatalabRatio(item.latestRatio)}`,
      })),
      emptyText: problemNotice(trendNotice) ?? 'DataLab 검증 결과가 있으면 표시됩니다.',
    },
    {
      title: '자동완성키워드',
      caption: 'NAVER 자동완성',
      items: autocompleteItems.slice(0, 10).map((item) => {
        const trendItem = trendMap.get(compactKeyword(item.keyword));
        return {
          keyword: item.keyword,
          meta: trendItem ? `지수 ${formatDatalabRatio(trendItem.latestRatio)}` : `#${formatNumber(item.rank)}`,
        };
      }),
      emptyText: problemNotice(autocompleteNotice) ?? '네이버 자동완성 키워드가 있으면 표시됩니다.',
    },
  ];

  return (
    <section className={cn('mx-auto mt-5 w-full text-left', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black tracking-normal text-[var(--text-primary)]">연관키워드</h2>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
          aria-label={open ? '연관키워드 접기' : '연관키워드 펼치기'}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {open && (
        loading ? (
          <div className="flex h-24 items-center justify-center gap-2 rounded-xl bg-[var(--surface)] text-xs font-black text-[var(--text-secondary)] shadow-sm">
            <Loader2 size={16} className="animate-spin" />
            연관 키워드를 가져오는 중입니다.
          </div>
        ) : (
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {groups.map((group) => (
              <CompactKeywordGroup key={group.title} {...group} onUseKeyword={onUseKeyword} />
            ))}
          </div>
        )
      )}
    </section>
  );
}

function SourceKeywordGrid({
  seed,
  searchAdItems,
  trendItems,
  autocompleteItems,
  coupangKeywordItems,
  coupangProductNameTokens,
  loading,
  searchAdNotice,
  trendNotice,
  autocompleteNotice,
  coupangKeywordNotice,
  onUseKeyword,
  onSelectKeywords,
}: {
  seed: string | null;
  searchAdItems: NaverRelatedKeyword[];
  trendItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: CoupangProductNameToken[];
  loading: boolean;
  searchAdNotice: string | null;
  trendNotice: string | null;
  autocompleteNotice: string | null;
  coupangKeywordNotice: string | null;
  onUseKeyword: (keyword: string) => void;
  onSelectKeywords: (keywords: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  if (
    !loading &&
    !seed &&
    !searchAdNotice &&
    !trendNotice &&
    !autocompleteNotice &&
    !coupangKeywordNotice &&
    searchAdItems.length === 0 &&
    trendItems.length === 0 &&
    autocompleteItems.length === 0 &&
    coupangKeywordItems.length === 0 &&
    coupangProductNameTokens.length === 0
  ) return null;

  const trendMap = new Map(trendItems.map((item) => [compactKeyword(item.keyword), item]));
  const naverSearchRelatedRows = searchAdItems.map((item) => {
    const trendItem = trendMap.get(compactKeyword(item.keyword));
    return {
      keyword: item.keyword,
      meta: item.monthlyTotalSearchCount == null ? '-' : formatNumber(item.monthlyTotalSearchCount),
      caption: trendItem ? `DataLab ${formatDatalabRatio(trendItem.latestRatio)}` : null,
    };
  });
  const naverAutocompleteRows = autocompleteItems.map((item) => ({
    keyword: item.keyword,
    meta: '',
    caption: `#${formatNumber(item.rank)}`,
  }));
  const coupangAutocompleteRows = coupangKeywordItems
    .filter((item) => item.source === 'coupang-autocomplete')
    .map((item) => ({
      keyword: item.keyword,
      meta: item.monthlyTotalSearchCount == null ? '-' : formatNumber(item.monthlyTotalSearchCount),
      caption: `#${formatNumber(item.rank)}`,
    }));
  const coupangRows = coupangKeywordItems.map((item) => ({
    keyword: item.keyword,
    meta: item.monthlyTotalSearchCount == null ? '-' : formatNumber(item.monthlyTotalSearchCount),
    caption: `#${formatNumber(item.rank)}`,
  }));
  const coupangRelatedRows = (coupangKeywordItems.filter((item) => item.source !== 'coupang-autocomplete').length > 0
    ? coupangKeywordItems.filter((item) => item.source !== 'coupang-autocomplete')
    : coupangKeywordItems
  ).map((item) => ({
    keyword: item.keyword,
    meta: item.monthlyTotalSearchCount == null ? '-' : formatNumber(item.monthlyTotalSearchCount),
    caption: `#${formatNumber(item.rank)}`,
  }));
  const coupangProductRows = coupangProductNameTokens.map((item) => ({
    keyword: item.keyword,
    meta: formatNumber(item.count),
    caption: null,
  }));
  const cards = [
    {
      title: 'NAVER',
      label: '검색 자동완성',
      rows: naverAutocompleteRows,
      resultText: `결과 ${formatNumber(naverAutocompleteRows.length)}건`,
      emptyText: '네이버 자동완성 응답이 있으면 표시됩니다.',
      valueHeader: null,
    },
    {
      title: 'NAVER',
      label: '검색 연관키워드',
      rows: naverSearchRelatedRows,
      resultText: `결과 ${formatNumber(naverSearchRelatedRows.length)}건`,
      emptyText: 'SearchAd 연관 키워드가 있으면 표시됩니다.',
      valueHeader: '월 검색량',
    },
    {
      title: 'COUPANG',
      label: '인기키워드',
      rows: coupangRows,
      resultText: `결과 ${formatNumber(coupangRows.length)}건`,
      emptyText: '쿠팡 검색 페이지에서 후보를 가져오면 표시됩니다.',
      valueHeader: '월 검색량',
    },
    {
      title: 'COUPANG',
      label: '연관키워드',
      rows: coupangRelatedRows,
      resultText: `결과 ${formatNumber(coupangRelatedRows.length)}건`,
      emptyText: '쿠팡 검색 DOM 연관 키워드가 있으면 표시됩니다.',
      valueHeader: '월 검색량',
    },
    {
      title: 'COUPANG',
      label: '검색 자동완성',
      rows: coupangAutocompleteRows,
      resultText: `결과 ${formatNumber(coupangAutocompleteRows.length)}건`,
      emptyText: '쿠팡 자동완성 응답이 있으면 표시됩니다.',
      valueHeader: '월 검색량',
    },
    {
      title: 'COUPANG',
      label: '상품명 분석',
      rows: coupangProductRows,
      resultText: `결과 ${formatNumber(coupangProductRows.length)}건`,
      emptyText: '쿠팡 검색 결과 상품명 토큰을 가져오면 표시됩니다.',
      valueHeader: '빈도수',
    },
    {
      title: 'GMARKET',
      label: '검색 자동완성',
      rows: [],
      resultText: '수집기 미연결',
      emptyText: 'G마켓 자동완성 수집기는 다음 단계에서 연결합니다.',
      valueHeader: null,
    },
    {
      title: 'AUCTION',
      label: '검색 자동완성',
      rows: [],
      resultText: '수집기 미연결',
      emptyText: '옥션 자동완성 수집기는 다음 단계에서 연결합니다.',
      valueHeader: null,
    },
    {
      title: '11번가',
      label: '연관키워드',
      rows: [],
      resultText: '수집기 미연결',
      emptyText: '11번가 연관 키워드 수집기는 다음 단계에서 연결합니다.',
      valueHeader: null,
    },
    {
      title: '11번가',
      label: '검색 자동완성',
      rows: [],
      resultText: '수집기 미연결',
      emptyText: '11번가 자동완성 수집기는 다음 단계에서 연결합니다.',
      valueHeader: null,
    },
  ] satisfies SourceKeywordCardProps[];

  return (
    <section className="mt-5 w-full text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black tracking-normal text-[var(--text-primary)]">마켓별 키워드 후보</h2>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
          aria-label={open ? '마켓별 키워드 후보 접기' : '마켓별 키워드 후보 펼치기'}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {open && (
        loading ? (
          <div className="flex h-28 items-center justify-center gap-2 rounded-xl bg-[var(--surface)] text-xs font-black text-[var(--text-secondary)] shadow-sm">
            <Loader2 size={16} className="animate-spin" />
            연관 키워드를 가져오는 중입니다.
          </div>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {cards.map((card) => (
              <SourceKeywordCard
                key={`${card.title}:${card.label}`}
                {...card}
                onUseKeyword={onUseKeyword}
                onSelectKeywords={onSelectKeywords}
              />
            ))}
          </div>
        )
      )}
      {open && (searchAdNotice || trendNotice || autocompleteNotice || coupangKeywordNotice) && !loading && (
        <div className="mt-3 space-y-1">
          {searchAdNotice && <p className="text-xs font-black text-[var(--text-tertiary)]">{searchAdNotice}</p>}
          {trendNotice && <p className="text-xs font-black text-[var(--text-tertiary)]">{trendNotice}</p>}
          {autocompleteNotice && <p className="text-xs font-black text-[var(--text-tertiary)]">{autocompleteNotice}</p>}
          {coupangKeywordNotice && <p className="text-xs font-black text-[var(--text-tertiary)]">{coupangKeywordNotice}</p>}
        </div>
      )}
    </section>
  );
}

function CompactKeywordGroup({
  title,
  caption,
  items,
  emptyText,
  onUseKeyword,
}: {
  title: string;
  caption: string;
  items: Array<{ keyword: string; meta: string }>;
  emptyText: string;
  onUseKeyword: (keyword: string) => void;
}) {
  return (
    <article className="flex h-[300px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-[var(--surface-sunken)] px-4 py-3">
        <h3 className="min-w-0 truncate text-sm font-black text-[var(--text-primary)]">{title}</h3>
        <span className="shrink-0 text-[10px] font-black text-[var(--text-tertiary)]">{caption}</span>
      </div>
      {items.length === 0 ? (
        <p className="flex flex-1 items-start px-4 py-7 text-xs font-bold leading-5 text-[var(--text-tertiary)]">{emptyText}</p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-[var(--border-subtle)] overflow-y-auto">
          {items.map((item, index) => (
            <li key={`${title}:${item.keyword}`} className="grid grid-cols-[24px_minmax(0,1fr)_74px] items-center gap-2 px-3 py-2.5">
              <span className="text-xs font-black text-[#ff5a1f]">{index + 1}</span>
              <button
                type="button"
                onClick={() => onUseKeyword(item.keyword)}
                className="min-w-0 truncate text-left text-sm font-black text-[var(--text-primary)] transition hover:text-[var(--primary)]"
              >
                {item.keyword}
              </button>
              <span className="truncate text-right text-xs font-bold text-[var(--text-tertiary)]">{item.meta}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

interface SourceKeywordCardProps {
  title: string;
  label: string;
  rows: Array<{ keyword: string; meta: string; caption?: string | null }>;
  resultText: string;
  valueHeader: string | null;
  emptyText: string;
}

function SourceKeywordCard({
  title,
  label,
  rows,
  resultText,
  valueHeader,
  emptyText,
  onUseKeyword,
  onSelectKeywords,
}: SourceKeywordCardProps & {
  onUseKeyword: (keyword: string) => void;
  onSelectKeywords: (keywords: string[]) => void;
}) {
  const hasRows = rows.length > 0;

  return (
    <article className="flex h-[280px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-[var(--surface-sunken)] px-4 py-3">
        <h3 className="min-w-0 text-sm font-black text-[var(--text-primary)]">
          <span className={title === 'NAVER' ? 'text-[#24a148]' : title === 'COUPANG' ? 'text-[#7a3328]' : title === '11번가' ? 'text-[#ff2b2b]' : 'text-[var(--text-primary)]'}>
            {title}
          </span>{' '}
          <span>{label}</span>
        </h3>
        <button
          type="button"
          disabled={!hasRows}
          onClick={() => onSelectKeywords(rows.map((row) => row.keyword))}
          className="shrink-0 rounded-md bg-[var(--surface-raised)] px-3 py-1.5 text-[11px] font-black text-[var(--text-secondary)] transition hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          전체선택
        </button>
      </div>
      <div className="flex justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-xs font-black text-[var(--text-tertiary)]">
        <span>키워드</span>
        <span className="ml-auto">{valueHeader ?? ''}</span>
        <span className="text-[#2563eb]">{resultText}</span>
      </div>
      {!hasRows ? (
        <p className="px-4 py-7 text-xs font-bold leading-5 text-[var(--text-tertiary)]">{emptyText}</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {rows.map((row) => (
            <li key={`${title}:${label}:${row.keyword}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2 text-sm font-bold text-[var(--text-primary)] last:border-b-0">
              <button
                type="button"
                onClick={() => onUseKeyword(row.keyword)}
                className="min-w-0 flex-1 truncate text-left transition hover:text-[var(--primary)]"
              >
                {row.keyword}
              </button>
              {valueHeader && <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{row.meta || '-'}</span>}
              {!valueHeader && row.caption && <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{row.caption}</span>}
              <button
                type="button"
                onClick={() => onUseKeyword(row.keyword)}
                className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                조회
              </button>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function compactKeyword(keyword: string) {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

function compareSearchAdRelatedKeywords(a: NaverRelatedKeyword, b: NaverRelatedKeyword) {
  return (
    (b.monthlyTotalSearchCount ?? -1) - (a.monthlyTotalSearchCount ?? -1) ||
    a.keyword.localeCompare(b.keyword, 'ko')
  );
}

function compareDatalabRelatedKeywords(a: NaverDatalabKeywordTrend, b: NaverDatalabKeywordTrend) {
  return (
    b.latestRatio - a.latestRatio ||
    b.trendDelta - a.trendDelta ||
    (b.trendRate ?? -999) - (a.trendRate ?? -999) ||
    a.keyword.localeCompare(b.keyword, 'ko')
  );
}

function formatDatalabRatio(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function problemNotice(notice: string | null) {
  if (!notice) return null;
  return /필요|예전|실패|오류|미지원|타임아웃|닫혔|port|closed/i.test(notice) ? notice : null;
}

async function fetchSearchCountsForKeywords(keywords: string[]): Promise<Map<string, number | null>> {
  const normalized = Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 20);
  const counts = new Map<string, number | null>();
  for (const batch of chunk(normalized, 5)) {
    const response = await searchNaverRelatedKeywords({
      seedKeywords: batch,
      maxResults: 100,
    });
    for (const item of response.items) {
      counts.set(compactKeyword(item.keyword), item.monthlyTotalSearchCount);
    }
  }

  const missingKeywords = normalized.filter((keyword) => !counts.has(compactKeyword(keyword)));
  for (const keyword of missingKeywords) {
    try {
      const response = await searchNaverRelatedKeywords({
        seedKeywords: [keyword],
        maxResults: 100,
      });
      const exactItem = response.items.find((item) => compactKeyword(item.keyword) === compactKeyword(keyword));
      counts.set(compactKeyword(keyword), exactItem?.monthlyTotalSearchCount ?? null);
    } catch {
      counts.set(compactKeyword(keyword), null);
    }
  }
  return counts;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
