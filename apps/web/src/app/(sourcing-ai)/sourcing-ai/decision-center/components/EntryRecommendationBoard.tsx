'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, RefreshCw, Sparkles, Star } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { startTrendCollectionAction } from '@/lib/manual-operation-actions';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { isTerminalOperationStatus, useOperationRun } from '@/hooks/useOperationRun';
import {
  askSourcingAssistant,
  fetchEntryRecommendations,
  type EntryInterestKeywordStatus,
  type EntryRecommendation,
  type EntrySourceStatus,
} from '../lib/entry-recommendation-api';
import { collectInterestKeywordsFrom1688 } from '../lib/collect-interest-1688';
import { EntryRecommendationDetail } from './EntryRecommendationDetail';
import { EntryRecommendationTable } from './EntryRecommendationTable';
import { SourcingAssistantPanel, type AssistantTurn } from './SourcingAssistantPanel';

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
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interestFilter, setInterestFilter] = useState<InterestFilter>('all');
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [operationRunId, setOperationRunId] = useState<string | null>(null);
  const handledRunRef = useRef<string | null>(null);

  const { data: run, isError: runQueryFailed } = useOperationRun(operationRunId);
  // run 조회가 실패하면 `run` 이 계속 undefined 라 "수집 중"으로 굳어 버튼이 영구히
  // 잠긴다. 조회 실패는 수집 중이 아니라 상태를 모르는 것이므로 잠금을 푼다.
  const isCollecting =
    operationRunId !== null &&
    !runQueryFailed &&
    (!run || !isTerminalOperationStatus(run.status));

  const recommendationsQuery = useQuery({
    queryKey: queryKeys.sourcing.entryRecommendations(LIMIT),
    queryFn: () => fetchEntryRecommendations(LIMIT),
    // 수집 중에는 자주, 평소에는 느리게. 화면이 살아 있는 느낌을 주되 서버를 때리지 않는다.
    refetchInterval: isCollecting ? 5_000 : 60_000,
    placeholderData: keepPreviousData,
  });

  const collectMutation = useMutation({
    mutationFn: () => startTrendCollectionAction({ sourceSurface: 'domain_screen' }),
    onSuccess: (operationRun) => {
      setOperationRunId(operationRun.id);
      toast.info('트렌드 수집을 시작했습니다.');
    },
    onError: (error: unknown) => {
      toast.error(isApiError(error) ? error.message : '수집을 시작하지 못했습니다.');
    },
  });

  // 수집이 끝나면 한 번만 반응한다. 폴링이 같은 terminal 상태를 반복해서 주기 때문이다.
  useEffect(() => {
    if (!run || !isTerminalOperationStatus(run.status)) return;
    if (handledRunRef.current === run.id) return;
    handledRunRef.current = run.id;
    setOperationRunId(null);

    if (run.status === 'succeeded') {
      toast.success('수집이 끝났습니다. 추천을 갱신합니다.');
    } else {
      // 상태 문자열만 보여주면 왜 실패했는지 알 수 없다. run 이 실은 사유를 같이 낸다.
      const detail = run.error?.message?.trim();
      toast.error(
        detail
          ? `수집이 ${run.status} 상태로 끝났습니다 — ${detail}`
          : `수집이 ${run.status} 상태로 끝났습니다.`,
      );
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
  }, [run, queryClient]);

  /**
   * 관심 키워드로 1688 공급 후보를 확장 프로그램으로 수집한다.
   *
   * 서버가 아니라 확장이 도는 이유는 `collect-interest-1688.ts` 주석 참고.
   * 슬라이더 검증이 뜨면 확장이 탭을 열어 두고 운영자에게 넘기므로, 그 사유를
   * 삼키지 않고 토스트로 그대로 전달한다.
   */
  const interestKeywords = recommendationsQuery.data?.interestKeywords ?? [];
  const collectInterestMutation = useMutation({
    mutationFn: () =>
      collectInterestKeywordsFrom1688(interestKeywords.map((entry) => entry.keyword)),
    onSuccess: (result) => {
      if (result.merged > 0) {
        // "추가"가 아니라 "반영" — 병합 후 중복이 제거되므로 순증가분과 다를 수 있다.
        toast.success(`관심 키워드 수집 완료 — 후보 ${result.merged}건을 표에 반영했습니다.`);
      } else {
        toast.warning('수집은 끝났지만 표에 반영할 후보가 없었습니다.');
      }
      for (const error of result.errors.slice(0, 3)) {
        toast.error(`${error.keyword}: ${error.message}`);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : '관심 키워드 수집에 실패했습니다.');
    },
  });

  const assistantMutation = useMutation({
    mutationFn: (question: string) =>
      askSourcingAssistant({ question, visibleContext: buildVisibleContext(items) }),
    onSuccess: (answer, question) => {
      setTurns((prev) => [
        ...prev,
        { id: `a:${prev.length}:${question}`, role: 'assistant', text: answer.text, answer },
      ]);
    },
    onError: (error: unknown, question) => {
      const message = isApiError(error) ? error.message : '어시스턴트 호출에 실패했습니다.';
      toast.error(message);
      // 토스트는 사라진다. 대화 로그에 실패를 남겨, 질문만 덩그러니 남아 답을
      // 기다리는 것처럼 보이지 않게 한다.
      setTurns((prev) => [
        ...prev,
        { id: `e:${prev.length}:${question}`, role: 'assistant', text: `⚠️ ${message}` },
      ]);
    },
  });

  const allItems = recommendationsQuery.data?.items ?? [];
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

  // 진행 중이면 새 질문을 받지 않는다. CLI 프로세스가 겹쳐 뜨는 것을 막는다.
  const handleAsk = (question: string) => {
    if (assistantMutation.isPending) return;
    setTurns((prev) => [...prev, { id: `u:${prev.length}:${question}`, role: 'user', text: question }]);
    assistantMutation.mutate(question);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // "지금 보이는 행이 모두 선택돼 있는가"로 판단한다. 개수만 비교하면 필터를 바꿔
  // 개수가 우연히 같아졌을 때 전체선택이 해제로 뒤집힌다.
  const toggleAll = () =>
    setSelectedIds((prev) => {
      const allVisibleSelected =
        items.length > 0 && items.every((item) => prev.has(item.id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        items.forEach((item) => next.delete(item.id));
        return next;
      }
      const next = new Set(prev);
      items.forEach((item) => next.add(item.id));
      return next;
    });

  return (
    <div className="grid gap-4 xl:h-[calc(100dvh-48px)] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
        <Toolbar
          selectedCount={selectedIds.size}
          totalCount={items.length}
          isCollecting={isCollecting || collectMutation.isPending}
          isRefreshing={recommendationsQuery.isFetching}
          onCollect={() => collectMutation.mutate()}
          onRefresh={() => void recommendationsQuery.refetch()}
        />

        <SourceStrip
          sources={recommendationsQuery.data?.sources ?? []}
          dataGaps={recommendationsQuery.data?.dataGaps ?? []}
        />

        <InterestStrip
          keywords={interestKeywords}
          filter={interestFilter}
          interestCount={interestCount}
          totalCount={visibleItems.length}
          isCollecting={collectInterestMutation.isPending}
          onCollect={() => collectInterestMutation.mutate()}
          onFilterChange={setInterestFilter}
        />

        {activeItem && (
          <EntryRecommendationDetail
            item={activeItem}
            isAsking={assistantMutation.isPending}
            onClose={() => setActiveId(null)}
            onAsk={handleAsk}
          />
        )}

        {recommendationsQuery.isLoading ? (
          <p className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-xs font-semibold text-[var(--text-tertiary)]">
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            추천 상품을 불러오는 중…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            dataGaps={recommendationsQuery.data?.dataGaps ?? []}
            filter={interestFilter}
            hasAnyItem={visibleItems.length > 0}
            onClearFilter={() => setInterestFilter('all')}
          />
        ) : (
          <EntryRecommendationTable
            items={items}
            selectedIds={selectedIds}
            activeId={activeId}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onRemove={(id) => setRemovedIds((prev) => new Set(prev).add(id))}
            onSelectRow={(id) => setActiveId((prev) => (prev === id ? null : id))}
          />
        )}
      </div>

      <SourcingAssistantPanel
        turns={turns}
        isBusy={assistantMutation.isPending}
        // 최신 답변 기준. `find` 로 첫 답변에 고정하면 코퍼스가 갱신돼도 옛 숫자가 남는다.
        documentCount={
          [...turns].reverse().find((turn) => turn.answer)?.answer?.documentCount ?? null
        }
        onAsk={handleAsk}
      />
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
          disabled={isCollecting}
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

/** 어시스턴트에게 넘길 "지금 화면" 요약. 상위 몇 줄만 넣어 프롬프트를 짧게 유지한다. */
function buildVisibleContext(items: EntryRecommendation[]): string {
  return items
    .slice(0, 10)
    .map(
      (item) =>
        `${item.rank}. ${item.title} (키워드 ${item.keyword ?? '-'}, ${item.grade}등급 ${item.score}점, 마진 ${item.estimatedMarginRate ?? '-'}%)`,
    )
    .join('\n');
}
