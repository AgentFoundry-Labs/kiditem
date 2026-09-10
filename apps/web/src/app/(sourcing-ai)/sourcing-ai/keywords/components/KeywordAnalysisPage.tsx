'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, Loader2, Plus, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  fetchKeywordAnalysisSnapshot,
  keywordAnalysisInput,
  keywordAnalysisSnapshotQueryKey,
  type KeywordAnalysisInput,
  type NaverAutocompleteKeyword,
  type NaverDatalabDevice,
  type NaverDatalabGender,
  type NaverDatalabKeywordTrend,
  type NaverDatalabPopularKeywordBoard,
  type NaverDatalabTimeUnit,
  type NaverRelatedKeyword,
} from '../../lib/keyword-analysis-snapshot-api';
import {
  type SourcingInterestSource,
  type SourcingKeywordSuggestionItem,
  type SourcingKeywordSuggestionToken,
} from '@kiditem/shared/sourcing';
import { KeywordAnalysisWorkbench } from './KeywordAnalysisWorkbench';
import { EmptyState, PopularKeywordCard } from './KeywordAnalysisPopularBoard';
import { TrendComparePanel } from './KeywordAnalysisTrendPanel';
import { TrendKeywordAgentPanel } from './TrendKeywordAgentPanel';
import { InterestKeywordManager } from './InterestKeywordManager';
import {
  filterLabel,
  matchesFocusMode,
  projectVisibleBoard,
  timeUnitLabel,
  type BoardFilterKey,
  type FocusMode,
  type VisibleBoard,
} from './keyword-analysis-helpers';
import { deriveTrendKeywordAgent, type TrendKeywordAgentResult } from '../lib/trend-keyword-agent';
import { createKeywordInterestTarget } from '../../lib/sourcing-interest-target';
import {
  useRemoveSourcingInterestTarget,
  useSaveSourcingInterestTarget,
  useSaveSourcingKeywordPreference,
  useSourcingInterestTargets,
  useSourcingKeywordPreferences,
} from '../../hooks/use-sourcing-workspace';
import { useNaverAnalysisSource } from '../../hooks/use-naver-analysis-source';
import {
  useCoupangKeywordSuggestionSourceOwner,
  type CoupangKeywordSuggestionSourceOwnerView,
} from '../../hooks/use-coupang-keyword-suggestion-source-owner';
import { SourceCollectionStatus } from '../../components/SourceCollectionStatus';
import {
  fetchCoupangKeywordSuggestionSnapshot,
  keywordSuggestionSnapshotQueryKey,
} from '../lib/coupang-keyword-snapshot-api';

interface CoupangPopularKeyword extends SourcingKeywordSuggestionItem {
  monthlyTotalSearchCount: number | null;
}

const DEFAULT_RANK_LIMIT = '20';
const normalizeExclude = (value: string) => value.replace(/\s+/g, '').toLowerCase();

export function KeywordAnalysisPage() {
  const [initialRouteState] = useState(readKeywordAnalysisRouteState);
  const [boards, setBoards] = useState<NaverDatalabPopularKeywordBoard[]>([]);
  const [timeUnit, setTimeUnit] = useState<NaverDatalabTimeUnit>('date');
  const [gender, setGender] = useState<'all' | NaverDatalabGender>('all');
  const [age, setAge] = useState('all');
  const [device, setDevice] = useState<'all' | NaverDatalabDevice>('all');
  const [keywordQuery, setKeywordQuery] = useState(initialRouteState.keyword);
  const [snapshotKeyword, setSnapshotKeyword] = useState(initialRouteState.keyword);
  const [selectedBoardKey, setSelectedBoardKey] = useState<BoardFilterKey>('all');
  const [rankLimit, setRankLimit] = useState(DEFAULT_RANK_LIMIT);
  const [focusMode, setFocusMode] = useState<FocusMode>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [excludeInput, setExcludeInput] = useState('');
  const [trendText, setTrendText] = useState('포켓몬카드\n레고\n슬라임\n잔디인형');
  const [trendItems, setTrendItems] = useState<NaverDatalabKeywordTrend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendNotice, setTrendNotice] = useState<string | null>(null);
  const [relatedSearchSeed, setRelatedSearchSeed] = useState<string | null>(null);
  const [searchAdRelatedItems, setSearchAdRelatedItems] = useState<NaverRelatedKeyword[]>([]);
  const [relatedSearchItems, setRelatedSearchItems] = useState<NaverDatalabKeywordTrend[]>([]);
  const [autocompleteItems, setAutocompleteItems] = useState<NaverAutocompleteKeyword[]>([]);
  const [loadingSearchAdRelated, setLoadingSearchAdRelated] = useState(false);
  const [loadingRelatedSearch, setLoadingRelatedSearch] = useState(false);
  const [loadingAutocomplete, setLoadingAutocomplete] = useState(false);
  const [searchAdNotice, setSearchAdNotice] = useState<string | null>(null);
  const [relatedSearchNotice, setRelatedSearchNotice] = useState<string | null>(null);
  const [autocompleteNotice, setAutocompleteNotice] = useState<string | null>(null);
  const [trendAgentResult, setTrendAgentResult] = useState<TrendKeywordAgentResult | null>(null);
  const [trendAgentNotice, setTrendAgentNotice] = useState<string | null>(null);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [loadingTrendAgent, setLoadingTrendAgent] = useState(false);
  const [showRecentKeywords, setShowRecentKeywords] = useState(true);
  const [analysisInput, setAnalysisInput] = useState<KeywordAnalysisInput>(() =>
    keywordAnalysisInput('trend_agent'),
  );
  const analysisSnapshotKey = useMemo(
    () => keywordAnalysisSnapshotQueryKey(analysisInput),
    [analysisInput],
  );
  const analysisSource = useNaverAnalysisSource({
    input: analysisInput,
  });
  const analysisSnapshotQuery = useQuery({
    queryKey: analysisSnapshotKey,
    queryFn: () => fetchKeywordAnalysisSnapshot(analysisInput),
    placeholderData: (previous) => previous,
  });
  const keywordSnapshotQuery = useQuery({
    queryKey: keywordSuggestionSnapshotQueryKey(snapshotKeyword),
    queryFn: () => fetchCoupangKeywordSuggestionSnapshot(snapshotKeyword),
    placeholderData: (previous) => previous,
  });
  const coupangKeywordSource = useCoupangKeywordSuggestionSourceOwner({
    keyword: snapshotKeyword,
  });
  const coupangKeywordItems = useMemo<CoupangPopularKeyword[]>(
    () => (keywordSnapshotQuery.data?.items ?? []).map((item) => ({
      ...item,
      monthlyTotalSearchCount: null,
    })),
    [keywordSnapshotQuery.data?.items],
  );
  const coupangProductNameTokens = keywordSnapshotQuery.data?.productNameTokens ?? [];
  const loadingCoupangKeywords =
    keywordSnapshotQuery.isFetching && keywordSnapshotQuery.data === undefined;
  const coupangKeywordNotice = keywordSnapshotQuery.error instanceof Error
    ? keywordSnapshotQuery.error.message
    : keywordSnapshotQuery.data
      ? keywordSnapshotQuery.data.items.length > 0
        ? `저장된 쿠팡 키워드 ${formatNumber(keywordSnapshotQuery.data.items.length)}개를 표시합니다.`
        : '저장된 쿠팡 키워드 스냅샷이 비어 있습니다.'
      : null;
  const keywordPreferencesQuery = useSourcingKeywordPreferences();
  const saveKeywordPreference = useSaveSourcingKeywordPreference();
  const interestTargetsQuery = useSourcingInterestTargets();
  const saveInterestTarget = useSaveSourcingInterestTarget();
  const removeInterestTarget = useRemoveSourcingInterestTarget();

  const excludedPreferences = useMemo(
    () => (keywordPreferencesQuery.data ?? []).filter((preference) => preference.excluded),
    [keywordPreferencesQuery.data],
  );
  const excludedKeywords = useMemo(
    () => excludedPreferences.map((preference) => preference.keyword),
    [excludedPreferences],
  );
  const preferenceByNormalizedKeyword = useMemo(
    () => new Map((keywordPreferencesQuery.data ?? []).map((preference) => [
      normalizeExclude(preference.keyword),
      preference,
    ])),
    [keywordPreferencesQuery.data],
  );

  const excludeSet = useMemo(
    () => new Set(excludedKeywords.map(normalizeExclude)),
    [excludedKeywords],
  );
  const visibleBoards = useMemo<VisibleBoard[]>(() => {
    const rankCap = Number(rankLimit);
    return boards
      .filter((board) => selectedBoardKey === 'all' || board.key === selectedBoardKey)
      .filter((board) => matchesFocusMode(board.key, focusMode))
      .map((board) => projectVisibleBoard(board, rankCap, excludeSet));
  }, [boards, focusMode, rankLimit, selectedBoardKey, excludeSet]);
  const rows = useMemo(() => visibleBoards.flatMap((board) => board.ranks.map((rank) => ({ board, rank }))), [visibleBoards]);
  const interestKeywordTargets = useMemo(() => (
    (interestTargetsQuery.data ?? []).filter((target) => target.targetType === 'keyword' && target.keyword)
  ), [interestTargetsQuery.data]);
  const interestKeywordSet = useMemo(
    () => new Set(interestKeywordTargets.map((target) => normalizeExclude(target.keyword ?? target.label))),
    [interestKeywordTargets],
  );
  const loadingInterestKeywords =
    interestTargetsQuery.isLoading ||
    interestTargetsQuery.isFetching ||
    saveInterestTarget.isPending ||
    removeInterestTarget.isPending;

  const recentKeywords = useMemo(() => {
    const fromBoards = boards.flatMap((board) => board.ranks.map((rank) => rank.keyword));
    return Array.from(new Set([...fromBoards, '포켓몬카드', '레고', '슬라임', '잔디인형'])).slice(0, 4);
  }, [boards]);

  const addExcludedKeyword = (raw: string) => {
    const keyword = raw.trim();
    if (!keyword) return;
    const existing = preferenceByNormalizedKeyword.get(normalizeExclude(keyword));
    if (existing?.excluded) return;
    setExcludeInput('');
    saveKeywordPreference.mutate(
      {
        keyword,
        command: { excluded: true, expectedVersion: existing?.version ?? 0 },
      },
      {
        onError: () => setNotice('제외 키워드 저장에 실패했습니다. 최신 목록을 다시 확인해주세요.'),
      },
    );
  };
  const removeExcludedKeyword = (keyword: string) => {
    const existing = preferenceByNormalizedKeyword.get(normalizeExclude(keyword));
    if (!existing) return;
    saveKeywordPreference.mutate(
      {
        keyword,
        command: { excluded: false, expectedVersion: existing.version },
      },
      {
        onError: () => setNotice('제외 키워드 저장에 실패했습니다. 최신 목록을 다시 확인해주세요.'),
      },
    );
  };

  const buildAnalysisInput = (
    action: KeywordAnalysisInput['action'],
    overrides: Partial<KeywordAnalysisInput> = {},
  ) => keywordAnalysisInput(action, {
    timeUnit,
    gender,
    age,
    device,
    selectedBoardKey,
    rankLimit: Number(rankLimit),
    focusMode,
    finalLimit: 30,
    ...overrides,
  });

  const startAnalysis = async (input: KeywordAnalysisInput) => {
    setAnalysisInput(input);
    const result = await analysisSource.collect(input);
    const params = new URLSearchParams(window.location.search);
    if (input.keyword) params.set('keyword', input.keyword);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    return result;
  };

  useEffect(() => {
    const snapshot = analysisSnapshotQuery.data;
    if (!snapshot) return;
    const { input, result } = snapshot;
    if (input.action === 'popular') {
      const nextBoards = result.popular?.boards ?? [];
      setBoards(nextBoards);
      const keywordCount = nextBoards.reduce((sum, board) => sum + board.ranks.length, 0);
      setNotice(`저장된 인기 키워드 ${formatNumber(keywordCount)}개를 표시합니다.`);
      setLoadingPopular(false);
      return;
    }
    if (input.action === 'compare') {
      const items = result.trends?.items ?? [];
      setTrendItems(items);
      setTrendNotice(`저장된 키워드 ${formatNumber(items.length)}개 트렌드를 표시합니다.`);
      setLoadingTrends(false);
      return;
    }
    if (input.action === 'related') {
      const related = (result.related?.items ?? [])
        .filter((item) => item.keyword.trim().length > 0)
        .toSorted(compareSearchAdRelatedKeywords);
      const autocomplete = result.autocomplete.flatMap((response) => response.items)
        .filter((item) => item.keyword.trim().length > 0);
      const trends = (result.trends?.items ?? []).toSorted(compareDatalabRelatedKeywords);
      setRelatedSearchSeed(input.keyword ?? null);
      setSearchAdRelatedItems(related);
      setAutocompleteItems(autocomplete);
      setRelatedSearchItems(trends);
      setSearchAdNotice(related.length > 0 ? `저장된 SearchAd 연관 키워드 ${formatNumber(related.length)}개` : '저장된 SearchAd 연관 키워드가 비어 있습니다.');
      setAutocompleteNotice(autocomplete.length > 0 ? `저장된 네이버 자동완성 ${formatNumber(autocomplete.length)}개` : '저장된 네이버 자동완성이 비어 있습니다.');
      setRelatedSearchNotice(trends.length > 0 ? `저장된 DataLab 검증 ${formatNumber(trends.length)}개` : '저장된 DataLab 검증 결과가 비어 있습니다.');
      setLoadingSearchAdRelated(false);
      setLoadingAutocomplete(false);
      setLoadingRelatedSearch(false);
      return;
    }
    const agentResult = deriveTrendKeywordAgent(snapshot);
    setTrendAgentResult(agentResult);
    setTrendAgentNotice(
      agentResult.candidates.length > 0
        ? `저장된 트렌드 후보 ${formatNumber(agentResult.candidates.length)}개를 표시합니다.`
        : '조건에 맞는 저장된 트렌드 후보가 아직 없습니다.',
    );
    setLoadingTrendAgent(false);
  }, [analysisSnapshotQuery.data]);

  const loadPopularKeywords = async () => {
    setLoadingPopular(true);
    setNotice(null);
    try {
      await startAnalysis(buildAnalysisInput('popular'));
    } catch (error) {
      setLoadingPopular(false);
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const changeTimeUnit = (value: NaverDatalabTimeUnit) => setTimeUnit(value);
  const changeRankLimit = (value: string) => setRankLimit(value);
  const changeGender = (value: 'all' | NaverDatalabGender) => setGender(value);
  const changeAge = (value: string) => setAge(value);
  const changeDevice = (value: 'all' | NaverDatalabDevice) => setDevice(value);

  const compareTrends = async () => {
    const keywords = Array.from(new Set(trendText.split(/\n|,/).map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 5);
    if (keywords.length === 0) {
      setTrendNotice('비교할 키워드를 1개 이상 입력하세요.');
      return;
    }
    setLoadingTrends(true);
    setTrendNotice(null);
    try {
      await startAnalysis(buildAnalysisInput('compare', { keywords }));
    } catch (error) {
      setLoadingTrends(false);
      setTrendNotice(error instanceof Error ? error.message : String(error));
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
    setRelatedSearchSeed(normalizedKeyword);
    setSearchAdRelatedItems([]);
    setRelatedSearchItems([]);
    setAutocompleteItems([]);
    setSearchAdNotice(null);
    setRelatedSearchNotice(null);
    setAutocompleteNotice(null);
    setLoadingSearchAdRelated(true);
    setLoadingRelatedSearch(false);
    setLoadingAutocomplete(true);
    setSnapshotKeyword(normalizedKeyword);
    try {
      await startAnalysis(buildAnalysisInput('related', { keyword: normalizedKeyword }));
    } catch (error) {
      setSearchAdNotice(error instanceof Error ? error.message : String(error));
      setLoadingSearchAdRelated(false);
      setLoadingAutocomplete(false);
    }
  };

  const useKeywordForAnalysis = (keyword: string) => {
    setKeywordQuery(keyword);
    addTrendKeyword(keyword);
    void loadRelatedKeywordData(keyword);
  };

  const loadInterestKeywords = async () => {
    setInterestNotice(null);
    try {
      const result = await interestTargetsQuery.refetch();
      if (result.error) throw result.error;
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const trackKeywordInterest = async (
    keyword: string,
    source: SourcingInterestSource,
    _metrics?: Record<string, number | string | null>,
  ) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;
    setInterestNotice(null);
    try {
      await saveInterestTarget.mutateAsync(
        createKeywordInterestTarget({ keyword: normalizedKeyword, source }),
      );
      const refreshed = await interestTargetsQuery.refetch();
      const targets = refreshed.data ?? interestTargetsQuery.data ?? [];
      setInterestNotice(
        `${normalizedKeyword} 관심 키워드 저장 완료 · 키워드 ${formatNumber(targets.filter((target) => target.targetType === 'keyword').length)}개 관리 중`,
      );
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const removeKeywordInterest = async (targetId: string) => {
    setInterestNotice(null);
    try {
      await removeInterestTarget.mutateAsync(targetId);
      const refreshed = await interestTargetsQuery.refetch();
      const targets = refreshed.data ?? interestTargetsQuery.data ?? [];
      setInterestNotice(`관심 키워드 삭제 완료 · 키워드 ${formatNumber(targets.filter((target) => target.targetType === 'keyword').length)}개 관리 중`);
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const isInterestKeyword = (keyword: string) => interestKeywordSet.has(normalizeExclude(keyword));

  const runTrendAgent = async () => {
    setLoadingTrendAgent(true);
    setTrendAgentNotice(null);
    try {
      await startAnalysis(buildAnalysisInput('trend_agent'));
    } catch (error) {
      setTrendAgentResult(null);
      setTrendAgentNotice(error instanceof Error ? error.message : String(error));
      setLoadingTrendAgent(false);
    }
  };

  const submitKeywordSearch = () => {
    const keyword = keywordQuery.trim();
    if (!keyword) return;
    addTrendKeyword(keyword);
    void loadRelatedKeywordData(keyword);
  };

  const collectCoupangKeywordSuggestions = () => {
    const keyword = keywordQuery.trim();
    if (!keyword) {
      setNotice('수집할 키워드를 입력해주세요.');
      return;
    }
    setSnapshotKeyword(keyword);
    void coupangKeywordSource.collect(keyword).catch(() => {
      // The owner hook keeps the uncertain correlation key and exposes the
      // actual owner/transport error in the control below.
    });
  };

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="flex w-full flex-col gap-5">
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
            isInterestKeyword={isInterestKeyword}
            onTrackKeyword={(keyword, source, metrics) => {
              void trackKeywordInterest(keyword, source, metrics);
            }}
            onSelectKeywords={(keywords) => {
              setTrendText((current) => {
                const next = [...keywords, ...current.split(/\n|,/).map((item) => item.trim()).filter(Boolean)];
                return Array.from(new Set(next)).slice(0, 5).join('\n');
              });
            }}
          />

          <SourceCollectionStatus source={analysisSource} />

          <CoupangKeywordCollectionControl
            keyword={snapshotKeyword}
            source={coupangKeywordSource}
            onCollect={collectCoupangKeywordSuggestions}
            disabled={!keywordQuery.trim()}
          />

          <InterestKeywordManager
          className="mt-4 max-w-[1600px]"
          loading={loadingInterestKeywords}
          notice={interestNotice}
          targets={interestTargetsQuery.data ?? []}
            onRefresh={() => void loadInterestKeywords()}
            onRemove={(targetId) => {
              void removeKeywordInterest(targetId);
            }}
            onUseKeyword={useKeywordForAnalysis}
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
          onRankLimitChange={changeRankLimit}
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
              <div className="inline-flex items-center gap-1">
                <span className="text-xs font-bold text-[var(--text-tertiary)]">표시</span>
                <div className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-0.5">
                  {['10', '20', '50', '100'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => changeRankLimit(value)}
                      disabled={loadingPopular}
                      aria-pressed={rankLimit === value}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60',
                        rankLimit === value
                          ? 'bg-[#ff5a1f] text-white'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]',
                      )}
                    >
                      {value}개
                    </button>
                  ))}
                </div>
              </div>
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

          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--surface-sunken)] px-3 py-2">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)]">
              <Filter size={13} /> 제외 키워드
            </span>
            {excludedKeywords.length === 0 ? (
              <span className="text-xs font-medium text-[var(--text-quaternary)]">없음 — 오른쪽에서 추가하세요</span>
            ) : (
              excludedKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeExcludedKeyword(keyword)}
                    aria-label={`${keyword} 제외 해제`}
                    className="text-[var(--text-tertiary)] transition hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
            <div className="ml-auto inline-flex items-center gap-1.5">
              <input
                value={excludeInput}
                onChange={(event) => setExcludeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addExcludedKeyword(excludeInput);
                  }
                }}
                placeholder="뺄 키워드 입력"
                className="h-8 w-32 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => addExcludedKeyword(excludeInput)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:bg-[var(--border-subtle)]"
              >
                <Plus size={12} /> 추가
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
              <PopularKeywordCard
                key={board.key}
                board={board}
                disabled={loadingPopular}
                isInterestKeyword={isInterestKeyword}
                onUseKeyword={useKeywordForAnalysis}
                onTrackKeyword={(keyword, metrics) => {
                  void trackKeywordInterest(keyword, 'keyword_analysis', metrics);
                }}
              />
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
          isInterestKeyword={isInterestKeyword}
          onTrackKeyword={(keyword, source, metrics) => {
            void trackKeywordInterest(keyword, source, metrics);
          }}
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
  isInterestKeyword,
  onTrackKeyword,
}: {
  className?: string;
  seed: string | null;
  searchAdItems: NaverRelatedKeyword[];
  trendItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: SourcingKeywordSuggestionToken[];
  loading: boolean;
  searchAdNotice: string | null;
  trendNotice: string | null;
  autocompleteNotice: string | null;
  coupangKeywordNotice: string | null;
  onUseKeyword: (keyword: string) => void;
  isInterestKeyword: (keyword: string) => boolean;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
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
              <CompactKeywordGroup
                key={group.title}
                {...group}
                onUseKeyword={onUseKeyword}
                isInterestKeyword={isInterestKeyword}
                onTrackKeyword={onTrackKeyword}
              />
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
  isInterestKeyword,
  onTrackKeyword,
  onSelectKeywords,
}: {
  seed: string | null;
  searchAdItems: NaverRelatedKeyword[];
  trendItems: NaverDatalabKeywordTrend[];
  autocompleteItems: NaverAutocompleteKeyword[];
  coupangKeywordItems: CoupangPopularKeyword[];
  coupangProductNameTokens: SourcingKeywordSuggestionToken[];
  loading: boolean;
  searchAdNotice: string | null;
  trendNotice: string | null;
  autocompleteNotice: string | null;
  coupangKeywordNotice: string | null;
  onUseKeyword: (keyword: string) => void;
  isInterestKeyword: (keyword: string) => boolean;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
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
                isInterestKeyword={isInterestKeyword}
                onTrackKeyword={onTrackKeyword}
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

function CoupangKeywordCollectionControl({
  keyword,
  source,
  onCollect,
  disabled,
}: {
  keyword: string;
  source: CoupangKeywordSuggestionSourceOwnerView;
  onCollect: () => void;
  disabled: boolean;
}) {
  const latestAttempt = source.latestAttempt;
  const statusMessage = source.isCollecting
    ? '쿠팡 키워드 수집 중입니다. 이전 완료 스냅샷은 계속 표시합니다.'
    : latestAttempt?.state === 'FAILED'
      ? `마지막 쿠팡 키워드 수집 실패: ${latestAttempt.errorCode ?? 'UNKNOWN'}${latestAttempt.errorMessage ? ` — ${latestAttempt.errorMessage}` : ''}${source.latestComplete ? ' · 이전 완료 스냅샷을 유지합니다.' : ''}`
      : latestAttempt?.state === 'COMPLETE'
        ? '쿠팡 키워드 수집을 완료했습니다. 저장된 스냅샷을 갱신했습니다.'
        : source.latestComplete
          ? '저장된 쿠팡 키워드 스냅샷을 표시합니다.'
          : null;

  return (
    <section className="mx-auto mt-4 w-full max-w-[1600px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[var(--text-tertiary)]">쿠팡 키워드 제안 수집</p>
          <p className="mt-1 truncate text-sm font-black text-[var(--text-primary)]">
            대상 키워드: {keyword}
          </p>
        </div>
        <button
          type="button"
          onClick={onCollect}
          disabled={disabled || source.isCollecting}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7a3328] px-4 text-xs font-black text-white transition hover:bg-[#642920] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="쿠팡 키워드 수집"
        >
          {source.isCollecting && <Loader2 size={15} className="animate-spin" />}
          {source.isCollecting ? '수집 중' : '쿠팡 키워드 수집'}
        </button>
      </div>
      {statusMessage && (
        <p
          className={cn(
            'mt-2 text-xs font-bold leading-5',
            latestAttempt?.state === 'FAILED' || source.error ? 'text-rose-700' : 'text-[var(--text-tertiary)]',
          )}
          role={latestAttempt?.state === 'FAILED' || source.error ? 'alert' : undefined}
        >
          {statusMessage}
        </p>
      )}
      {source.error && latestAttempt?.state !== 'FAILED' && (
        <p className="mt-1 text-xs font-bold leading-5 text-rose-700" role="alert">
          {source.error} · 같은 수집 버튼으로 확인하거나 재시도할 수 있습니다.
        </p>
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
  isInterestKeyword,
  onTrackKeyword,
}: {
  title: string;
  caption: string;
  items: Array<{ keyword: string; meta: string }>;
  emptyText: string;
  onUseKeyword: (keyword: string) => void;
  isInterestKeyword: (keyword: string) => boolean;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
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
            <CompactKeywordRow
              key={`${title}:${item.keyword}`}
              index={index}
              item={item}
              sourceTitle={title}
              isInterestKeyword={isInterestKeyword}
              onUseKeyword={onUseKeyword}
              onTrackKeyword={onTrackKeyword}
            />
          ))}
        </ol>
      )}
    </article>
  );
}

function CompactKeywordRow({
  index,
  item,
  sourceTitle,
  isInterestKeyword,
  onUseKeyword,
  onTrackKeyword,
}: {
  index: number;
  item: { keyword: string; meta: string };
  sourceTitle: string;
  isInterestKeyword: (keyword: string) => boolean;
  onUseKeyword: (keyword: string) => void;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
}) {
  const registered = isInterestKeyword(item.keyword);

  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)_74px_48px] items-center gap-2 px-3 py-2.5">
      <span className="text-xs font-black text-[#ff5a1f]">{index + 1}</span>
      <button
        type="button"
        onClick={() => onUseKeyword(item.keyword)}
        className="min-w-0 truncate text-left text-sm font-black text-[var(--text-primary)] transition hover:text-[var(--primary)]"
      >
        {item.keyword}
      </button>
      <span className="truncate text-right text-xs font-bold text-[var(--text-tertiary)]">{item.meta}</span>
      <button
        type="button"
        onClick={() => onTrackKeyword(item.keyword, interestSourceForCompactGroup(sourceTitle), parseMetricFromMeta(item.meta))}
        disabled={registered}
        className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {registered ? '등록됨' : '추적'}
      </button>
    </li>
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
  isInterestKeyword,
  onTrackKeyword,
  onSelectKeywords,
}: SourceKeywordCardProps & {
  onUseKeyword: (keyword: string) => void;
  isInterestKeyword: (keyword: string) => boolean;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
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
            <SourceKeywordRow
              key={`${title}:${label}:${row.keyword}`}
              row={row}
              sourceTitle={title}
              valueHeader={valueHeader}
              isInterestKeyword={isInterestKeyword}
              onUseKeyword={onUseKeyword}
              onTrackKeyword={onTrackKeyword}
            />
          ))}
        </ol>
      )}
    </article>
  );
}

function SourceKeywordRow({
  row,
  sourceTitle,
  valueHeader,
  isInterestKeyword,
  onUseKeyword,
  onTrackKeyword,
}: {
  row: { keyword: string; meta: string; caption?: string | null };
  sourceTitle: string;
  valueHeader: string | null;
  isInterestKeyword: (keyword: string) => boolean;
  onUseKeyword: (keyword: string) => void;
  onTrackKeyword: (keyword: string, source: SourcingInterestSource, metrics?: Record<string, number | string | null>) => void;
}) {
  const registered = isInterestKeyword(row.keyword);

  return (
    <li className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 text-sm font-bold text-[var(--text-primary)] last:border-b-0">
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
      <button
        type="button"
        onClick={() => onTrackKeyword(row.keyword, interestSourceForSourceCard(sourceTitle), parseMetricFromMeta(row.meta))}
        disabled={registered}
        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {registered ? '등록됨' : '추적'}
      </button>
    </li>
  );
}

function compactKeyword(keyword: string) {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

function interestSourceForCompactGroup(title: string): SourcingInterestSource {
  if (title === '쿠팡 인기검색어' || title === '상품명분석') return 'keyword_analysis';
  return 'keyword_analysis';
}

function interestSourceForSourceCard(title: string): SourcingInterestSource {
  if (title === 'COUPANG') return 'keyword_analysis';
  if (title === 'NAVER') return 'keyword_analysis';
  return 'keyword_analysis';
}

function parseMetricFromMeta(meta: string): Record<string, number | string | null> {
  const numeric = Number(meta.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) {
    return meta ? { label: meta } : {};
  }
  if (meta.includes('월')) {
    return { monthlySearchCount: numeric };
  }
  if (meta.includes('지수')) {
    return { latestTrendRatio: numeric };
  }
  if (meta.startsWith('#')) {
    return { rank: numeric };
  }
  return { value: numeric };
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

function readKeywordAnalysisRouteState(): {
  keyword: string;
} {
  if (typeof window === 'undefined') {
    return { keyword: '슬라임' };
  }
  const params = new URLSearchParams(window.location.search);
  const keyword = params.get('keyword')?.normalize('NFKC').trim() || '슬라임';
  return {
    keyword: keyword.slice(0, 100),
  };
}

const OPERATION_RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
