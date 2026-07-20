'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Database,
  Download,
  Loader2,
  Map,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Table2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import {
  buildToyKeywordCsv,
  clusterToyKeywords,
  filterToyKeywords,
  mergeToyKeywordSignals,
  type ToyKeywordFilters,
  type ToySortKey,
} from '../lib/toy-keyword-intelligence';
import {
  collectNaverTrend,
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
  fetchTrendSeeds,
  type TrendCollectResult,
} from '../lib/toy-trend-api';
import { ToyCategoryControls } from './ToyCategoryControls';
import { SelectedKeywordQueue, ToyKeywordMap, ToyKeywordTable } from './ToyKeywordViews';

type ResultView = 'map' | 'table';

const POPULAR_DAYS = 7;
const KEYWORD_DAYS = 30;

const defaultFilters: ToyKeywordFilters = {
  scope: 'all',
  minSearches: null,
  query: '',
  quickFilters: [],
  sortBy: 'rank',
};

const sortOptions: Array<{ value: ToySortKey; label: string }> = [
  { value: 'rank', label: '완구 인기순위' },
  { value: 'searches', label: '월 검색량 높은순' },
  { value: 'mobile', label: '모바일 검색량 높은순' },
  { value: 'trend', label: '검색지수 상승순' },
];

export function ToyCategorySourcingPage() {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState<ToyKeywordFilters>(() => ({ ...defaultFilters }));
  const [appliedFilters, setAppliedFilters] = useState<ToyKeywordFilters>(() => ({ ...defaultFilters }));
  const [view, setView] = useState<ResultView>('map');
  const [detailed, setDetailed] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastResult, setLastResult] = useState<TrendCollectResult | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const popularQuery = useQuery({
    queryKey: queryKeys.sourcing.trendPopularKeywords(POPULAR_DAYS),
    queryFn: () => fetchPopularKeywordBoards(POPULAR_DAYS),
    staleTime: 5 * 60 * 1000,
  });
  const keywordQuery = useQuery({
    queryKey: queryKeys.sourcing.trendNaverKeywords(KEYWORD_DAYS),
    queryFn: () => fetchNaverKeywordTrends(KEYWORD_DAYS),
    staleTime: 5 * 60 * 1000,
  });
  const seedsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendSeeds(),
    queryFn: fetchTrendSeeds,
    staleTime: 60 * 1000,
  });

  const toyBoard = popularQuery.data?.boards.find((board) => board.boardKey === 'toys_dolls');
  const allKeywords = useMemo(
    () => mergeToyKeywordSignals(toyBoard, keywordQuery.data?.keywords ?? []),
    [toyBoard, keywordQuery.data?.keywords],
  );
  const visibleKeywords = useMemo(
    () => filterToyKeywords(allKeywords, appliedFilters),
    [allKeywords, appliedFilters],
  );
  const clusters = useMemo(() => clusterToyKeywords(visibleKeywords), [visibleKeywords]);
  const selectedKeywords = useMemo(
    () => visibleKeywords.filter((keyword) => selectedIds.has(keyword.id)),
    [selectedIds, visibleKeywords],
  );

  const activeNaverSeedCount = (seedsQuery.data ?? []).filter(
    (seed) => seed.enabled && seed.sources.includes('naver'),
  ).length;
  const measuredKeywords = visibleKeywords.filter((keyword) => keyword.monthlyTotalSearchCount !== null);
  const totalSearches = measuredKeywords.reduce(
    (sum, keyword) => sum + (keyword.monthlyTotalSearchCount ?? 0),
    0,
  );
  const risingCount = visibleKeywords.filter(
    (keyword) => keyword.rankDelta === null
      || (typeof keyword.rankDelta === 'number' && keyword.rankDelta > 0)
      || (keyword.trendDelta !== null && keyword.trendDelta > 0),
  ).length;
  const latestBusinessDate = keywordQuery.data?.keywords
    .map((keyword) => keyword.latest.businessDate)
    .sort()
    .at(-1) ?? lastResult?.businessDate ?? null;
  const isLoading = popularQuery.isLoading || keywordQuery.isLoading || seedsQuery.isLoading;
  const queryError = popularQuery.error ?? keywordQuery.error ?? seedsQuery.error;
  const filtersDirty = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);

  const collectMutation = useMutation({
    mutationFn: collectNaverTrend,
    onSuccess: async (result) => {
      setLastResult(result);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trend() });
      const naver = result.results.find((item) => item.source === 'naver');
      if (naver?.ok) toast.success(`네이버 수집 완료 · ${formatNumber(naver.collected)}건 저장`);
      else toast.warning(naver?.error ?? '네이버 수집은 완료됐지만 일부 데이터가 실패했습니다.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '네이버 수집에 실패했습니다.'),
  });

  function toggleKeyword(keywordId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(keywordId)) next.delete(keywordId);
      else next.add(keywordId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = visibleKeywords.every((keyword) => next.has(keyword.id));
      visibleKeywords.forEach((keyword) => {
        if (allSelected) next.delete(keyword.id);
        else next.add(keyword.id);
      });
      return next;
    });
  }

  function applySearch() {
    setAppliedFilters({ ...draftFilters, quickFilters: [...draftFilters.quickFilters] });
    setSelectedIds(new Set());
  }

  function resetConditions() {
    const reset = { ...defaultFilters, quickFilters: [] };
    setDraftFilters(reset);
    setAppliedFilters(reset);
    setSelectedIds(new Set());
  }

  function resetAll() {
    resetConditions();
    setView('map');
    setDetailed(true);
  }

  async function refreshStoredData() {
    setManualRefreshing(true);
    try {
      const results = await Promise.all([
        popularQuery.refetch(),
        keywordQuery.refetch(),
        seedsQuery.refetch(),
      ]);
      if (results.some((result) => result.isError)) toast.error('일부 저장 데이터를 새로고침하지 못했습니다.');
      else toast.success('저장된 최신 스냅샷을 다시 불러왔습니다.');
    } finally {
      setManualRefreshing(false);
    }
  }

  function changeSort(sortBy: ToySortKey) {
    setDraftFilters((current) => ({ ...current, sortBy }));
    setAppliedFilters((current) => ({ ...current, sortBy }));
  }

  function downloadCsv() {
    const blob = new Blob([`\uFEFF${buildToyKeywordCsv(visibleKeywords)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kiditem-toy-keywords-${latestBusinessDate ?? 'latest'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-full bg-transparent px-6 py-6 text-[var(--text-primary)] 2xl:px-8">
      <div className="mx-auto w-full max-w-[1740px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                <Sparkles size={19} />
              </span>
              <div>
                <p className="text-[11px] font-black text-[var(--primary)]">TOY SOURCING RADAR</p>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">완구 키워드 트렌드</h1>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm font-bold text-[var(--text-tertiary)]">
              네이버 완구/인형 인기순위와 저장된 추적 시드의 검색량·검색지수만 사용합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
              최근 스냅샷 {latestBusinessDate ?? (allKeywords.length > 0 ? '저장 데이터 있음' : '아직 없음')}
            </span>
            <button
              type="button"
              onClick={() => void refreshStoredData()}
              disabled={manualRefreshing || collectMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(manualRefreshing && 'animate-spin')} />
              {manualRefreshing ? '새로고침 중' : '새로고침'}
            </button>
            <button
              type="button"
              onClick={() => collectMutation.mutate()}
              disabled={collectMutation.isPending || manualRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {collectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              {collectMutation.isPending ? '수집 중… 최대 1분' : '지금 수집'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <RotateCcw size={14} /> 전체 초기화
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-950">
          <b>출처:</b> 월·PC·모바일 검색량과 경쟁은 네이버 SearchAd, 검색지수·변화와 완구 인기순위는 네이버 DataLab입니다.
          현재 실제 수집 경로가 없는 <b>상품수는 표시하거나 추정하지 않습니다.</b>
        </div>

        {lastResult && (
          <CollectionResult result={lastResult} />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Sparkles} label="조건 결과" value={isLoading ? '…' : `${formatNumber(visibleKeywords.length)}개`} caption="완구 후보" tone="purple" />
          <MetricCard
            icon={Database}
            label="실측 월 검색량"
            value={measuredKeywords.length === 0 ? '—' : formatNumber(totalSearches)}
            caption={`${formatNumber(measuredKeywords.length)}개 합계`}
            tone="sky"
          />
          <MetricCard icon={TrendingUp} label="상승 신호" value={`${formatNumber(risingCount)}개`} caption="신규·순위·지수" tone="green" />
          <MetricCard icon={Database} label="활성 네이버 시드" value={`${formatNumber(activeNaverSeedCount)}개`} caption="검색량 수집 대상" tone="orange" />
        </div>

        <ToyCategoryControls
          filters={draftFilters}
          resultCount={visibleKeywords.length}
          activeNaverSeedCount={activeNaverSeedCount}
          isDirty={filtersDirty}
          onFiltersChange={setDraftFilters}
          onSearch={applySearch}
          onReset={resetConditions}
        />

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-[var(--text-primary)]">완구 키워드 결과</h2>
                <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-[10px] font-black text-[var(--text-tertiary)]">{clusters.length}개 묶음</span>
              </div>
              <p className="mt-1 text-[11px] font-bold text-[var(--text-tertiary)]">신규 진입·순위 상승·검색지수·모바일 실측 신호로 묶었습니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1">
                <ViewButton active={view === 'map'} icon={Map} label="묶음 지도" onClick={() => setView('map')} />
                <ViewButton active={view === 'table'} icon={Table2} label="표" onClick={() => setView('table')} />
              </div>
              {view === 'table' && (
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1">
                  <button type="button" onClick={() => setDetailed(false)} className={cn('h-7 rounded-md px-3 text-[10px] font-black', !detailed ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-tertiary)]')}>기본 보기</button>
                  <button type="button" onClick={() => setDetailed(true)} className={cn('h-7 rounded-md px-3 text-[10px] font-black', detailed ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-tertiary)]')}>상세 보기</button>
                </div>
              )}
              <select
                aria-label="키워드 정렬"
                value={appliedFilters.sortBy}
                onChange={(event) => changeSort(event.target.value as ToySortKey)}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] outline-none"
              >
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={visibleKeywords.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} /> CSV
              </button>
            </div>
          </div>

          {queryError && (
            <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              저장된 트렌드 데이터를 불러오지 못했습니다: {queryError instanceof Error ? queryError.message : '알 수 없는 오류'}
            </div>
          )}

          <div className="grid gap-4 bg-[var(--surface-sunken)]/50 p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              {isLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm font-bold text-[var(--text-tertiary)]">
                  <Loader2 size={18} className="animate-spin" /> 저장된 네이버 데이터 불러오는 중
                </div>
              ) : view === 'map' ? (
                <ToyKeywordMap
                  clusters={clusters}
                  selectedIds={selectedIds}
                  hasCollectedData={allKeywords.length > 0}
                  onToggleKeyword={toggleKeyword}
                />
              ) : (
                <ToyKeywordTable
                  keywords={visibleKeywords}
                  selectedIds={selectedIds}
                  detailed={detailed}
                  hasCollectedData={allKeywords.length > 0}
                  onToggleKeyword={toggleKeyword}
                  onToggleAll={toggleAllVisible}
                />
              )}
            </div>
            <SelectedKeywordQueue
              selectedKeywords={selectedKeywords}
              recommendedKeywords={visibleKeywords}
              onRemove={toggleKeyword}
              onClear={() => setSelectedIds(new Set())}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

const metricTone = {
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-orange-50 text-orange-600',
  sky: 'bg-sky-50 text-sky-600',
  green: 'bg-emerald-50 text-emerald-600',
};

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  caption: string;
  tone: keyof typeof metricTone;
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', metricTone[tone])}><Icon size={18} /></span>
        <div>
          <p className="text-[11px] font-black text-[var(--text-tertiary)]">{label}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <strong className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{value}</strong>
            <span className="text-[10px] font-bold text-[var(--text-tertiary)]">{caption}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function CollectionResult({ result }: { result: TrendCollectResult }) {
  const naver = result.results.find((item) => item.source === 'naver');
  if (!naver) return null;
  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 text-xs font-bold',
      naver.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900',
    )}>
      최근 네이버 수집 {result.businessDate} · {formatNumber(naver.collected)}건 저장
      {naver.error ? ` · ${naver.error}` : ''}
    </div>
  );
}

function ViewButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Map; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[10px] font-black transition', active ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-tertiary)]')}
    >
      <Icon size={13} /> {label}
    </button>
  );
}
