'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BrainCircuit,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useAuth } from '@/hooks/useAuth';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime } from '@/lib/utils';
import {
  buildSourcingDecisionCenterViewModel,
  type SourcingDecisionCandidateViewModel,
} from '../lib/sourcing-decision-center';
import {
  batchResultTurns,
  buildDecisionChatReply,
  greetingTurns,
  parseDecisionChatIntent,
  type DecisionChatCard,
  type DecisionChatIntent,
  type DecisionChatTurn,
} from '../lib/decision-center-chat';
import { canManageSourcingDecision } from '../lib/decision-center-presenter';
import {
  createDecisionProcurementIntent,
  getLatestSourcingDecisionBatch,
  listProcurementTestIntents,
  listSourcingLaunchCandidates,
  listSourcingSources,
  listSupplierOfferSnapshots,
  runSourcingShadowDecisionBatch,
  type CreateDecisionProcurementIntentInput,
  type RunSourcingShadowDecisionBatchInput,
} from '../lib/sourcing-intelligence-api';
import { DecisionCenterChat } from './DecisionCenterChat';
import { DecisionWorkspacePanel } from './DecisionWorkspacePanel';

const STALE_TIME_MS = 30_000;
const REFRESH_INTERVAL_MS = 60_000;
const SAMPLE_ORDER_UNITS = 1;

interface IntentMutationInput {
  candidate: SourcingDecisionCandidateViewModel;
  body: CreateDecisionProcurementIntentInput;
}

export function SourcingDecisionCenterPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [analysisKeyword, setAnalysisKeyword] = useState('');
  const [turns, setTurns] = useState<DecisionChatTurn[]>(() => greetingTurns());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceCard, setWorkspaceCard] = useState<DecisionChatCard | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const turnSeq = useRef(0);

  const sourcesQuery = useQuery({
    queryKey: queryKeys.sourcing.intelligenceSources(),
    queryFn: listSourcingSources,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const launchesQuery = useQuery({
    queryKey: queryKeys.sourcing.intelligenceLaunchCandidates(),
    queryFn: listSourcingLaunchCandidates,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const batchQuery = useQuery({
    queryKey: queryKeys.sourcing.intelligenceLatestDecision(),
    queryFn: getLatestSourcingDecisionBatch,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const offersQuery = useQuery({
    queryKey: queryKeys.sourcing.intelligenceSupplierOffers(),
    queryFn: listSupplierOfferSnapshots,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const intentsQuery = useQuery({
    queryKey: queryKeys.sourcing.intelligenceProcurementIntents(),
    queryFn: listProcurementTestIntents,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const viewModel = useMemo(
    () => buildSourcingDecisionCenterViewModel({
      sources: sourcesQuery.data ?? [],
      launchCandidates: launchesQuery.data ?? [],
      latestBatch: batchQuery.data ?? null,
      supplierOffers: offersQuery.data?.items ?? [],
      procurementIntents: intentsQuery.data?.items ?? [],
      procurementIntentTotal: intentsQuery.data?.total,
    }),
    [
      batchQuery.data,
      intentsQuery.data?.items,
      intentsQuery.data?.total,
      launchesQuery.data,
      offersQuery.data?.items,
      sourcesQuery.data,
    ],
  );

  const canManage = canManageSourcingDecision(user?.role);
  const queries = [sourcesQuery, launchesQuery, batchQuery, offersQuery, intentsQuery];
  const isInitialLoading = queries.some((query) => query.isLoading);
  const isFetching = queries.some((query) => query.isFetching);
  const lastUpdatedAt = Math.max(...queries.map((query) => query.dataUpdatedAt), 0);
  const queryFailures = [
    ['소스 권한', sourcesQuery.error],
    ['출시 후보', launchesQuery.error],
    ['결정배치', batchQuery.error],
    ['공급 Offer', offersQuery.error],
    ['조달 Intent', intentsQuery.error],
  ].filter((entry): entry is [string, Error] => entry[1] instanceof Error);

  function pushTurns(next: DecisionChatTurn[]) {
    setTurns((current) => [...current, ...next]);
  }

  const runMutation = useMutation({
    mutationFn: (input: RunSourcingShadowDecisionBatchInput) =>
      runSourcingShadowDecisionBatch(input),
    onSuccess: async (result) => {
      queryClient.setQueryData(
        queryKeys.sourcing.intelligenceLatestDecision(),
        result.record,
      );
      setSelectedId(result.record.items[0]?.id ?? null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.intelligence(),
      });
      turnSeq.current += 1;
      // 방금 받은 배치로 즉시 응답한다. React Query 캐시 반영을 기다리지 않도록
      // 결과 레코드를 그대로 넣어 read model 을 다시 만든다.
      const resultTurns = batchResultTurns({
          viewModel: buildSourcingDecisionCenterViewModel({
            sources: sourcesQuery.data ?? [],
            launchCandidates: launchesQuery.data ?? [],
            latestBatch: result.record,
            supplierOffers: offersQuery.data?.items ?? [],
            procurementIntents: intentsQuery.data?.items ?? [],
            procurementIntentTotal: intentsQuery.data?.total,
          }),
          turnSeq: turnSeq.current,
        });
      pushTurns(resultTurns);
      setWorkspaceCard(
        [...resultTurns].reverse().find((turn) => turn.card)?.card
          ?? { kind: 'batch' },
      );
      if (result.dataGaps.length > 0) {
        toast.warning(`데이터 공백 ${result.dataGaps.length}건이 함께 기록됐습니다.`);
      }
    },
    onError: (error) => {
      turnSeq.current += 1;
      pushTurns([
        {
          id: `agent:${turnSeq.current}:run-error`,
          role: 'agent',
          text: `분석을 실행하지 못했어요. ${friendlyError(error) ?? '잠시 후 다시 시도해 주세요.'}`,
        },
      ]);
    },
  });

  const intentMutation = useMutation({
    mutationFn: ({ candidate, body }: IntentMutationInput) =>
      createDecisionProcurementIntent(candidate.id, body),
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.intelligenceProcurementIntents(),
      });
      turnSeq.current += 1;
      pushTurns([
        {
          id: `agent:${turnSeq.current}:intent`,
          role: 'agent',
          text: result.duplicate
            ? '같은 요청이 이미 있어서 기존 건을 그대로 뒀어요.'
            : variables.body.intentType === 'request_sample'
              ? '샘플 요청을 검토 대기로 만들었어요. 발주는 만들지 않았습니다.'
              : '견적 요청(RFQ)을 검토 대기로 만들었어요. 발주는 만들지 않았습니다.',
          card: { kind: 'intents' },
        },
      ]);
      setWorkspaceCard({ kind: 'intents' });
    },
    onError: (error) => {
      turnSeq.current += 1;
      pushTurns([
        {
          id: `agent:${turnSeq.current}:intent-error`,
          role: 'agent',
          text: `요청을 만들지 못했어요. ${friendlyError(error) ?? '잠시 후 다시 시도해 주세요.'}`,
        },
      ]);
    },
  });

  function replyToIntent(intent: DecisionChatIntent, userText: string, chip: string) {
    turnSeq.current += 1;
    const replies = buildDecisionChatReply({
      intent,
      viewModel,
      focusedCandidateId: selectedId,
      canManage,
      turnSeq: turnSeq.current,
    });
    pushTurns([
      { id: `user:${turnSeq.current}`, role: 'user', text: userText, chip },
      ...replies,
    ]);
    const nextCard = [...replies].reverse().find((turn) => turn.card)?.card;
    if (nextCard) setWorkspaceCard(nextCard);
  }

  function submitCommand(message: string) {
    if (runMutation.isPending) return;
    const intent = parseDecisionChatIntent(message);
    if (!intent) return;
    replyToIntent(intent, message, '저장 결과 바로가기');
  }

  function runKeywordAnalysis(keyword: string) {
    const content = keyword.trim();
    if (!content || runMutation.isPending) return;
    const intent: DecisionChatIntent = { kind: 'run', keyword: content };
    setAnalysisKeyword('');
    replyToIntent(intent, content, '새 Shadow 분석');
    if (!canManage) return;
    runMutation.mutate({
      idempotencyKey: crypto.randomUUID(),
      keyword: content,
      category: null,
      expiresInHours: 24,
    });
  }

  function openCandidateDetail(candidateId: string) {
    const candidate = viewModel.candidates.find(({ id }) => id === candidateId);
    if (!candidate) return;
    setSelectedId(candidateId);
    setWorkspaceCard({ kind: 'candidate-detail', candidateId });
  }

  function showCandidateList() {
    setWorkspaceCard({ kind: 'candidate-list' });
  }

  function showSources() {
    setWorkspaceCard({ kind: 'sources' });
  }

  function showIntents() {
    setWorkspaceCard({ kind: 'intents' });
  }

  async function refreshAll() {
    setIsManualRefreshing(true);
    try {
      const results = await Promise.all(queries.map((query) => query.refetch()));
      if (results.some((result) => result.isError)) {
        toast.error('일부 의사결정 데이터를 새로고침하지 못했습니다.');
      } else {
        toast.success('의사결정 센터를 최신 저장 데이터로 갱신했습니다.');
      }
    } finally {
      setIsManualRefreshing(false);
    }
  }

  function requestRfq(candidate: SourcingDecisionCandidateViewModel) {
    if (!canManage || !candidate.canRequestRfq || intentMutation.isPending) return;
    intentMutation.mutate({
      candidate,
      body: { idempotencyKey: crypto.randomUUID(), intentType: 'request_rfq' },
    });
  }

  function requestSample(candidate: SourcingDecisionCandidateViewModel) {
    if (
      !canManage
      || !candidate.canRequestSample
      || candidate.offer?.sampleAvailable === false
      || intentMutation.isPending
    ) return;
    intentMutation.mutate({
      candidate,
      body: {
        idempotencyKey: crypto.randomUUID(),
        intentType: 'request_sample',
        requestedOrderUnits: SAMPLE_ORDER_UNITS,
      },
    });
  }

  // AppLayout 이 이미 `<main class="p-6">` 로 감싸므로 루트는 `<div>` 다(main 중첩 방지).
  // 높이도 그 패딩 상·하 24px 을 모두 빼야 뷰포트 안에 들어오고 하단 여백이 남는다.
  return (
    <div
      className="flex w-full flex-col gap-4 pb-28 text-[var(--text-primary)] xl:h-[calc(100dvh-48px)] xl:min-h-0 xl:overflow-hidden xl:pb-0"
      aria-busy={isInitialLoading || isFetching || runMutation.isPending}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <BrainCircuit size={21} aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black tracking-[0.16em] text-[var(--primary)]">SOURCING INTELLIGENCE</p>
              <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-black text-purple-700 ring-1 ring-inset ring-purple-200">
                {viewModel.latestBatch?.status === 'active' ? 'ACTIVE REVIEW' : 'SHADOW REVIEW'}
              </span>
            </div>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight">소싱 의사결정 센터</h1>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
              저장된 시장·공급 증거를 비교하고 다음 검증 요청을 결정합니다.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--text-secondary)]">
            <Clock3 size={14} aria-hidden="true" />
            {lastUpdatedAt > 0
              ? `갱신 ${formatDateTime(lastUpdatedAt, { hour: '2-digit', minute: '2-digit' })}`
              : '갱신 대기'}
          </span>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={isManualRefreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-black text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(isManualRefreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
            새로고침
          </button>
        </div>
      </header>

      {queryFailures.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-black">일부 저장 데이터를 불러오지 못해 확인 가능한 범위만 표시합니다.</p>
            <p className="mt-0.5">{queryFailures.map(([label, error]) => `${label}: ${friendlyError(error) ?? '조회 실패'}`).join(' · ')}</p>
          </div>
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {isFetching ? '의사결정 데이터를 갱신하는 중입니다.' : '의사결정 데이터 갱신이 완료되었습니다.'}
      </div>

      {isInitialLoading ? (
        <PageSkeleton variant="dashboard" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
          <DecisionWorkspacePanel
            viewModel={viewModel}
            activeCard={workspaceCard}
            selectedCandidateId={selectedId}
            canManage={canManage}
            isCreatingIntent={intentMutation.isPending}
            onShowCandidateList={showCandidateList}
            onShowSources={showSources}
            onShowIntents={showIntents}
            onOpenCandidateDetail={openCandidateDetail}
            onRequestRfq={requestRfq}
            onRequestSample={requestSample}
          />
          <DecisionCenterChat
            turns={turns}
            keyword={analysisKeyword}
            isBusy={runMutation.isPending}
            canManage={canManage}
            onKeywordChange={setAnalysisKeyword}
            onRunKeyword={runKeywordAnalysis}
            onCommand={submitCommand}
          />
        </div>
      )}
    </div>
  );
}
