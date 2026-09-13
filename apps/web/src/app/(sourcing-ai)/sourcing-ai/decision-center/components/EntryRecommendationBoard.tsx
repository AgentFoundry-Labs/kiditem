'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, RefreshCw, Sparkles, Star } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRightSurfaceLauncher } from '@/components/layout/right-surface-launcher-context';
import { useTrendSourceCollection } from '@/hooks/use-trend-source-collection';
import {
  type EntryInterestKeywordStatus,
  type EntryRecommendation,
  type EntrySourceStatus,
} from '../lib/entry-recommendation-api';
import {
  toEntryInterestKeywordStatuses,
  toEntryRecommendations,
  toEntrySourceStatuses,
} from '../../lib/sourcing-recommendation-presenter';
import {
  useSaveSourcingReviewSelection,
  useSourcingInterestTargets,
  useSourcingRecommendations,
  useSourcingReviewSelections,
} from '../../hooks/use-sourcing-workspace';
import { interestTargetSource } from '../../lib/sourcing-interest-target';
import {
  collectSourcing1688TrendsFromExtension,
  fetchSourcing1688TrendSourceStatus,
  type Sourcing1688TrendSourceStatus,
} from '../../lib/sourcing-1688-source-owner';
import { SourcingReadState } from '../../components/SourcingReadState';
import { SourceCollectionStatus } from '../../components/SourceCollectionStatus';
import { EntryRecommendationDetail } from './EntryRecommendationDetail';
import { EntryRecommendationTable } from './EntryRecommendationTable';

const LIMIT = 50;

/** 표를 어떤 기준으로 좁혀 볼지. 서버가 준 `interest` 분류를 그대로 쓴다. */
type InterestFilter = 'all' | 'interest' | 'other';

/**
 * 초기 진입 추천 보드.
 *
 * 운영자가 키워드를 치지 않는다. 들어오면 이미 서버가 네 소스를 합쳐 만든 상품 표가
 * 깔려 있고, 행을 클릭하면 그 상품의 근거가 아래로 펼쳐진다.
 *
 * 수집이 도는 동안에는 표를 5초마다 다시 읽어 결과가 흘러 들어오게 한다
 * (`CompetitorTrackingPage` 와 같은 패턴). 새 SSE 는 열지 않는다.
 */
export function EntryRecommendationBoard() {
  const { user } = useAuth();
  const { openConversationFromLauncher } = useRightSurfaceLauncher();
  const queryClient = useQueryClient();
  const organizationId = user?.organizationId ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interestFilter, setInterestFilter] = useState<InterestFilter>('all');
  const retryKeysByRequestFingerprint = useRef(new Map<string, string>());
  const saveSelection = useSaveSourcingReviewSelection();

  const recommendationsQuery = useSourcingRecommendations('entry', { limit: LIMIT });
  const recommendationRunId = recommendationsQuery.data?.data?.runId ?? null;
  const selectionsQuery = useSourcingReviewSelections('entry', recommendationRunId);
  const interestTargetsQuery = useSourcingInterestTargets();
  const dailyTrendSource = useTrendSourceCollection({
    input: {},
    snapshotQueryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
  });
  const isCollecting = dailyTrendSource.isCollecting;

  const recommendationItems = recommendationsQuery.data?.data?.items ?? [];
  const allItems = useMemo(() => toEntryRecommendations(recommendationItems), [recommendationItems]);
  const selectionByItemId = useMemo(
    () => new Map((selectionsQuery.data ?? []).map((selection) => [selection.itemKey, selection])),
    [selectionsQuery.data],
  );
  const selectedIds = useMemo(
    () => new Set(
      [...selectionByItemId.values()]
        .filter((selection) => selection.state === 'selected')
        .map((selection) => selection.itemKey),
    ),
    [selectionByItemId],
  );
  const removedIds = useMemo(
    () => new Set(
      [...selectionByItemId.values()]
        .filter((selection) => selection.state === 'removed')
        .map((selection) => selection.itemKey),
    ),
    [selectionByItemId],
  );
  const interestTargets = useMemo(
    () => (interestTargetsQuery.data ?? []).map((target) => ({
      keyword: target.keyword ?? undefined,
      label: target.label,
      source: interestTargetSource(target),
    })),
    [interestTargetsQuery.data],
  );
  const interestKeywords = useMemo(
    () => toEntryInterestKeywordStatuses(recommendationItems, interestTargets),
    [interestTargets, recommendationItems],
  );
  const interestSourceStatusQuery = useQuery({
    queryKey: queryKeys.sourcing.trend1688SourceStatus(),
    queryFn: fetchSourcing1688TrendSourceStatus,
    refetchInterval: (query) => (
      query.state.data?.latestAttempt?.state === 'RUNNING' ? 5_000 : false
    ),
  });
  const interestCollectionMutation = useMutation({
    mutationFn: async () => {
      const requestFingerprint = 'sourcing.1688.hot_product:all';
      const idempotencyKey = retryKeysByRequestFingerprint.current.get(requestFingerprint)
        ?? crypto.randomUUID();
      retryKeysByRequestFingerprint.current.set(requestFingerprint, idempotencyKey);
      const clearRetryKey = () => {
        if (retryKeysByRequestFingerprint.current.get(requestFingerprint) === idempotencyKey) {
          retryKeysByRequestFingerprint.current.delete(requestFingerprint);
        }
      };
      const result = await collectSourcing1688TrendsFromExtension({ idempotencyKey });
      if (result.terminalState === 'COMPLETE') {
        if (!result.success) {
          throw new Error('KidItem OS 익스텐션이 완료 상태와 충돌하는 결과를 반환했습니다.');
        }
        clearRetryKey();
        return result;
      }
      if (result.terminalState === 'FAILED') {
        clearRetryKey();
        throw new Error(result.error ?? '1688 공급 수집에 실패했습니다. 새로 시도해주세요.');
      }
      throw new Error(result.error ?? '1688 공급 수집 결과를 확인하지 못했습니다. 다시 시도해주세요.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trend1688SourceStatus() });
      toast.success('1688 공급 후보를 갱신했습니다.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '1688 공급 수집에 실패했습니다.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.trend1688SourceStatus() });
    },
  });
  const interestCollectionActive =
    interestCollectionMutation.isPending
    || interestSourceStatusQuery.data?.latestAttempt?.state === 'RUNNING';
  const sources = useMemo(() => toEntrySourceStatuses(recommendationItems), [recommendationItems]);
  const dataGaps = recommendationsQuery.data?.warnings.map((warning) => warning.message) ?? [];
  const visibleItems = useMemo(
    () => allItems.filter((item) => !removedIds.has(item.id)),
    [allItems, removedIds],
  );
  const interestCount = visibleItems.filter((item) => item.interest !== null).length;
  const items = useMemo(
    () =>
      visibleItems.filter((item) => {
        if (interestFilter === 'interest') return item.interest !== null;
        if (interestFilter === 'other') return item.interest === null;
        return true;
      }),
    [visibleItems, interestFilter],
  );
  const activeItem = items.find((item) => item.id === activeId) ?? null;

  const handleAsk = (question: string, launcher: HTMLElement) => {
    openConversationFromLauncher({ fixedAgentKey: 'sourcing', draft: question }, launcher);
  };

  const saveEntrySelection = (itemKey: string, state: 'neutral' | 'selected' | 'removed') => {
    if (!recommendationRunId) {
      toast.error('추천 결과를 불러온 뒤 다시 시도해주세요.');
      return Promise.resolve();
    }
    const current = selectionByItemId.get(itemKey);
    return saveSelection.mutateAsync({
      itemKey,
      command: {
        workspaceKey: 'entry',
        recommendationRunId,
        state,
        expectedVersion: current?.version ?? 0,
      },
    }).catch(() => {
      toast.error('선택 상태를 저장하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.');
    });
  };

  const toggle = (id: string) => {
    const current = selectionByItemId.get(id);
    void saveEntrySelection(id, current?.state === 'selected' ? 'neutral' : 'selected');
  };

  // "지금 보이는 행이 모두 선택돼 있는가"로 판단한다. 개수만 비교하면 필터를 바꿔
  // 개수가 우연히 같아졌을 때 전체선택이 해제로 뒤집힌다.
  const toggleAll = () => {
    const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
    const state = allVisibleSelected ? 'neutral' : 'selected';
    void Promise.all(items.map((item) => saveEntrySelection(item.id, state)));
  };

  return (
    <div className="grid gap-4 xl:h-[calc(100dvh-48px)]">
      <div className="flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
        <Toolbar
          selectedCount={selectedIds.size}
          totalCount={items.length}
          isCollecting={isCollecting}
          isRefreshing={recommendationsQuery.isFetching}
          onCollect={() => void dailyTrendSource.collect({})}
          onRefresh={() => void recommendationsQuery.refetch()}
        />

        <SourceCollectionStatus source={dailyTrendSource} />

        <SourceStrip sources={sources} dataGaps={dataGaps} />

        <InterestStrip
          keywords={interestKeywords}
          filter={interestFilter}
          interestCount={interestCount}
          totalCount={visibleItems.length}
          isCollecting={interestCollectionActive}
          onCollect={() => {
            interestCollectionMutation.mutate();
          }}
          onFilterChange={setInterestFilter}
        />

        <Sourcing1688SourceStatus source={interestSourceStatusQuery.data} />

        {activeItem && (
          <EntryRecommendationDetail
            item={activeItem}
            onClose={() => setActiveId(null)}
            onAsk={handleAsk}
          />
        )}

        <SourcingReadState
          envelope={recommendationsQuery.data}
          isLoading={recommendationsQuery.isLoading}
          error={recommendationsQuery.error}
          emptyLabel="추천 상품을 불러오는 중…"
        >
          {items.length === 0 ? (
            <EmptyState
              dataGaps={dataGaps}
              filter={interestFilter}
              hasAnyItem={visibleItems.length > 0}
              onClearFilter={() => setInterestFilter('all')}
            />
          ) : (
            <EntryRecommendationTable
              items={items}
              selectedIds={selectedIds}
              activeId={activeId}
              isSaving={saveSelection.isPending}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onRemove={(id) => void saveEntrySelection(id, 'removed')}
              onSelectRow={(id) => setActiveId((prev) => (prev === id ? null : id))}
            />
          )}
        </SourcingReadState>
      </div>

    </div>
  );
}

function Toolbar({
  selectedCount,
  totalCount,
  isCollecting,
  isRefreshing,
  onCollect,
  onRefresh,
}: {
  selectedCount: number;
  totalCount: number;
  isCollecting: boolean;
  isRefreshing: boolean;
  onCollect: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <h1 className="mr-1 text-sm font-black text-[var(--text-primary)]">초기 진입 추천</h1>
      <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)]">
        {totalCount}개 · 선택 {selectedCount}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={cn(isRefreshing && 'animate-spin motion-reduce:animate-none')}
            aria-hidden="true"
          />
          새로고침
        </button>
        <button
          type="button"
          onClick={onCollect}
          disabled={isCollecting}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[11px] font-black text-white transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCollecting ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles size={12} aria-hidden="true" />
          )}
          {isCollecting ? '수집 중…' : '지금 수집'}
        </button>
      </div>
    </div>
  );
}

/** 네 소스가 각각 얼마나 최신인지 한 줄로 보여준다. 빈 소스는 여기서 드러난다. */
function SourceStrip({ sources, dataGaps }: { sources: EntrySourceStatus[]; dataGaps: string[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => {
          const empty = source.rowCount === 0;
          const stale = source.staleDays != null && source.staleDays >= 7;
          return (
            <span
              key={source.key}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold ring-1 ring-inset',
                empty
                  ? 'bg-rose-50 text-rose-700 ring-rose-200'
                  : stale
                    ? 'bg-amber-50 text-amber-700 ring-amber-200'
                    : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
              )}
            >
              {source.label}
              <span className="tabular-nums">
                {empty ? '없음' : `${source.rowCount}건`}
                {source.staleDays != null && ` · ${source.staleDays}일 전`}
              </span>
            </span>
          );
        })}
      </div>

      {dataGaps.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {dataGaps.map((gap) => (
            <li
              key={gap}
              className="flex items-start gap-1 text-[10px] font-semibold text-[var(--text-tertiary)]"
            >
              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              {gap}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sourcing1688SourceStatus({
  source,
}: {
  source: Sourcing1688TrendSourceStatus | undefined;
}) {
  if (!source || source.ready && source.latestAttempt?.state !== 'RUNNING') return null;

  const message = source.latestAttempt?.state === 'RUNNING'
    ? '1688 공급 후보를 수집 중입니다. 마지막 완료 데이터는 계속 표시됩니다.'
    : source.errorMessage ?? '1688 공급 데이터가 최신 계획과 일치하지 않습니다.';

  return (
    <p
      role="status"
      className={cn(
        'rounded-lg border px-3 py-2 text-xs font-semibold',
        source.latestAttempt?.state === 'RUNNING'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      {message}
    </p>
  );
}

/**
 * 등록된 관심 키워드와 각각에 잡힌 후보 수, 그리고 표 필터.
 *
 * 후보가 0건인 키워드를 흐리게가 아니라 **경고색**으로 보여준다 — 관심 키워드를
 * 등록해 뒀는데 후보가 없는 상태는 "해당 키워드로 수집을 돌려야 한다"는 할 일이지,
 * 조용히 넘어갈 정보가 아니다.
 */
function InterestStrip({
  keywords,
  filter,
  interestCount,
  totalCount,
  isCollecting,
  onCollect,
  onFilterChange,
}: {
  keywords: EntryInterestKeywordStatus[];
  filter: InterestFilter;
  interestCount: number;
  totalCount: number;
  isCollecting: boolean;
  onCollect: () => void;
  onFilterChange: (next: InterestFilter) => void;
}) {
  if (keywords.length === 0) return null;

  const missingSupply = keywords.filter((entry) => entry.state !== 'candidates').length;

  const tabs: { key: InterestFilter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: totalCount },
    { key: 'interest', label: '관심', count: interestCount },
    { key: 'other', label: '그 외', count: totalCount - interestCount },
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-black text-[var(--text-tertiary)]">
          <Star size={10} aria-hidden="true" />
          관심 키워드
        </span>

        {keywords.map((entry) => (
          <InterestChip key={entry.keyword} entry={entry} />
        ))}

        <button
          type="button"
          onClick={onCollect}
          disabled={isCollecting || missingSupply === 0}
          title="확장 프로그램이 내 브라우저에서 1688 검색 결과를 수집합니다"
          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCollecting ? (
            <Loader2 size={10} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles size={10} aria-hidden="true" />
          )}
          {isCollecting ? '1688 수집 중…' : `1688 공급 찾기${missingSupply > 0 ? ` (${missingSupply})` : ''}`}
        </button>

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onFilterChange(tab.key)}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-black transition-colors',
                filter === tab.key
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
              )}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 관심 키워드 칩. 세 상태를 색으로 구분한다.
 *
 * `demand_only`(수요는 있는데 공급 후보 없음)를 회색이 아니라 눈에 띄는 색으로 둔다 —
 * 이건 "없음"이 아니라 **지금 수집하면 바로 후보가 생기는 기회**라서다.
 */
function InterestChip({ entry }: { entry: EntryInterestKeywordStatus }) {
  const total = entry.exactCount + entry.relatedCount;
  const originLabel = entry.origins
    .map((origin) => (origin === 'saved' ? '키워드 분석에서 저장' : '트렌드 수집 시드'))
    .join(' · ');

  const demandHint = entry.demand
    ? [
        entry.demand.boardLabel && entry.demand.boardRank
          ? `${entry.demand.boardLabel} ${entry.demand.boardRank}위`
          : null,
        entry.demand.monthlySearchVolume != null
          ? `월 검색 ${formatNumber(entry.demand.monthlySearchVolume)}`
          : null,
        entry.demand.risingScore != null ? `급상승 ${entry.demand.risingScore}점` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const style =
    entry.state === 'candidates'
      ? 'bg-violet-50 text-violet-700 ring-violet-200'
      : entry.state === 'demand_only'
        ? 'bg-sky-50 text-sky-700 ring-sky-200'
        : 'bg-[var(--surface-sunken)] text-[var(--text-quaternary)] ring-[var(--border)]';

  const suffix =
    entry.state === 'candidates'
      ? `${total}건`
      : entry.state === 'demand_only'
        ? '수요만'
        : '신호 없음';

  return (
    <span
      title={[originLabel, demandHint].filter(Boolean).join(' · ')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset',
        style,
      )}
    >
      {entry.keyword}
      <span className="tabular-nums opacity-70">{suffix}</span>
    </span>
  );
}

/**
 * 빈 상태. 필터 때문에 비었는지, 원래 추천이 없는지를 구분해서 말한다 —
 * 필터를 걸어 놓고 "추천할 상품이 없다"고 하면 데이터가 없는 줄 오해한다.
 */
function EmptyState({
  dataGaps,
  filter,
  hasAnyItem,
  onClearFilter,
}: {
  dataGaps: string[];
  filter: InterestFilter;
  hasAnyItem: boolean;
  onClearFilter: () => void;
}) {
  const filteredOut = filter !== 'all' && hasAnyItem;

  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <p className="text-xs font-black text-[var(--text-primary)]">
        {filteredOut
          ? filter === 'interest'
            ? '관심 키워드에 걸린 추천 상품이 없습니다.'
            : '관심 키워드 밖의 추천 상품이 없습니다.'
          : '추천할 상품이 없습니다.'}
      </p>

      {filteredOut && (
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-2 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          전체 보기
        </button>
      )}

      {dataGaps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {dataGaps.map((gap) => (
            <li key={gap} className="text-[11px] font-semibold text-[var(--text-tertiary)]">
              {gap}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
