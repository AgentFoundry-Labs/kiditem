'use client';

import { type ReactNode, useMemo, useState } from 'react';
import type { SourcingRecommendationItem } from '@kiditem/shared/sourcing';
import { Bot, PackageCheck, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNumber } from '@/lib/utils';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { querySourcingAgentRag, type SourcingAgentRagSuggestedFilter } from '../lib/sourcing-agent-rag-api';
import {
  useCreateSourcingReviewBatch,
  useSaveSourcingReviewSelection,
  useSourcingInterestTargets,
  useSourcingRecommendations,
  useSourcingReviewSelections,
} from '../hooks/use-sourcing-workspace';
import { FinalCandidateCard } from './SellochFinalSelectionParts';
import { SourcingReadState } from './SourcingReadState';

type ChatMessage = { id: string; role: 'agent' | 'user'; content: string };
type ResultFilter = 'all' | 'selected' | 'selling' | 'strong' | 'recommended';

const QUICK_PROMPTS = ['발주 후보만', '쿠팡 반응 있는 것만', '선택한 것만', '발주 에이전트로 보내'];

const resultFilterLabels: Record<ResultFilter, string> = {
  all: '전체 1688 상품',
  selected: '선택 상품',
  selling: '쿠팡 반응 검증',
  strong: 'A/B급 1688 상품',
  recommended: '발주 후보',
};

export function SellochFinalSelectionPage() {
  const recommendationsQuery = useSourcingRecommendations('final', { limit: 72 });
  const recommendationRunId = recommendationsQuery.data?.data?.runId ?? null;
  const selectionsQuery = useSourcingReviewSelections('final', recommendationRunId);
  const saveSelection = useSaveSourcingReviewSelection();
  const createReviewBatch = useCreateSourcingReviewBatch();
  const interestTargetsQuery = useSourcingInterestTargets();
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  const candidateRows = useMemo(() => {
    return [...(recommendationsQuery.data?.data?.items ?? [])]
      .filter((item) => item.sourcePlatform === '1688')
      .sort((a, b) => b.score - a.score || a.itemKey.localeCompare(b.itemKey))
      .slice(0, 72);
  }, [recommendationsQuery.data]);

  const selectionByItemKey = useMemo(
    () => new Map((selectionsQuery.data ?? []).map((selection) => [selection.itemKey, selection])),
    [selectionsQuery.data],
  );

  const interestTargets = interestTargetsQuery.data ?? [];
  const keywordTargets = interestTargets.filter((target) => target.targetType === 'keyword');
  const categoryTargets = interestTargets.filter((target) => target.targetType === 'category');
  const selectedCount = candidateRows.filter(
    (row) => selectionByItemKey.get(row.itemKey)?.state === 'selected',
  ).length;
  const visibleRows = useMemo(() => {
    if (resultFilter === 'selected') {
      return candidateRows.filter((row) => selectionByItemKey.get(row.itemKey)?.state === 'selected');
    }
    if (resultFilter === 'selling') {
      return candidateRows.filter((row) =>
        row.coupang !== null || scoreComponent(row, 'momentum') >= 45,
      );
    }
    if (resultFilter === 'strong') {
      return candidateRows.filter((row) => row.grade === 'A' || row.grade === 'B');
    }
    if (resultFilter === 'recommended') {
      return candidateRows.filter((row) => row.baselineAction === 'order');
    }
    return candidateRows;
  }, [candidateRows, resultFilter, selectionByItemKey]);

  const toggleSelection = (row: SourcingRecommendationItem) => {
    if (!recommendationRunId) {
      toast.error('추천 run이 준비된 뒤 선택할 수 있습니다.');
      return;
    }
    const current = selectionByItemKey.get(row.itemKey);
    saveSelection.mutate(
      {
        itemKey: row.itemKey,
        command: {
          workspaceKey: 'final',
          recommendationRunId,
          state: current?.state === 'selected' ? 'neutral' : 'selected',
          expectedVersion: current?.version ?? 0,
        },
      },
      {
        onError: () => toast.error('선택 상태를 저장하지 못했습니다. 최신 상태를 다시 확인해주세요.'),
      },
    );
  };

  const submitReviewBatch = () => {
    if (!recommendationRunId || selectedCount === 0) return;
    createReviewBatch.mutate(
      {
        recommendationRunId,
        itemKeys: candidateRows
          .filter((row) => selectionByItemKey.get(row.itemKey)?.state === 'selected')
          .map((row) => row.itemKey),
        idempotencyKey: createSecureRandomUuid(),
      },
      {
        onSuccess: (batch) => {
          toast.success(`검토 배치 ${formatNumber(batch.itemCount)}개를 만들었습니다. 발주는 아직 실행되지 않습니다.`);
        },
        onError: () => toast.error('검토 배치를 만들지 못했습니다. 선택 상태를 다시 확인해주세요.'),
      },
    );
  };

  const submitChatMessage = async (message: string) => {
    const content = message.trim();
    if (!content || chatLoading) return;
    const now = Date.now();
    const nextFilter = resolveResultFilter(content);
    if (nextFilter) setResultFilter(nextFilter);

    setChatMessages((current) => [
      ...current,
      { id: `user:${now}`, role: 'user', content },
    ]);
    setChatInput('');
    setChatLoading(true);

    try {
      const rag = await querySourcingAgentRag({
        message: content,
        topK: 5,
        days: 7,
      });
      const apiFilter = nextFilter ?? resolveRagResultFilter(rag.suggestedFilter);
      if (apiFilter && apiFilter !== resultFilter) setResultFilter(apiFilter);
      setChatMessages((current) => [
        ...current,
        {
          id: `agent:${now}`,
          role: 'agent',
          content: [
            formatRagAgentResponse(rag),
            apiFilter ? `왼쪽 1688 상품을 "${resultFilterLabels[apiFilter]}" 기준으로 다시 필터링했어요.` : null,
          ].filter(Boolean).join(' '),
        },
      ]);
      } catch {
        setChatMessages((current) => [
          ...current,
          {
            id: `agent:${now}`,
            role: 'agent',
            content: 'RAG 근거를 불러오지 못했습니다. 수집 상태를 확인한 뒤 다시 시도해주세요.',
          },
        ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-28 xl:grid xl:h-[calc(100dvh-24px)] xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_406px] xl:overflow-hidden xl:pb-0">
      <section className="relative flex min-w-0 flex-1 flex-col xl:h-full xl:min-h-0">
        <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-[#dbe5f4] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
            <div>
              <h2 className="text-base font-black text-[#111827]">1688 매칭 상품</h2>
              <p className="mt-1 text-xs font-bold text-[#667085]">쿠팡은 근거로만 보고, 최종 선택 대상은 1688 상품입니다.</p>
            </div>
            <span className="rounded-full bg-[#f2f5ff] px-3 py-1.5 text-xs font-black text-[#4e6cf5]">
              {resultFilterLabels[resultFilter]} · {formatNumber(visibleRows.length)}개
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-28 [scrollbar-width:thin]">
            <SourcingReadState
              envelope={recommendationsQuery.data}
              isLoading={recommendationsQuery.isLoading}
              error={recommendationsQuery.error}
              emptyLabel="도매상품 검색에서 쿠팡 상품 기준 1688 이미지 매칭을 실행하면, 상품별 최적 1688 매칭 1개가 이 영역에 표시됩니다."
            >
              {visibleRows.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {visibleRows.map((row) => (
                    <FinalCandidateCard
                      key={row.itemKey}
                      row={row}
                      selected={selectionByItemKey.get(row.itemKey)?.state === 'selected'}
                      onToggleSelection={toggleSelection}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#cfd9e8] bg-[#f8fafc] px-5 py-10 text-center">
                  <p className="text-sm font-black text-[#111827]">1688 매칭 상품이 없습니다.</p>
                  <p className="mt-2 text-xs font-bold text-[#667085]">
                    도매상품 검색에서 쿠팡 상품 기준 1688 이미지 매칭을 실행하면, 상품별 최적 1688 매칭 1개가 이 영역에 표시됩니다.
                  </p>
                </div>
              )}
            </SourcingReadState>
          </div>
        </section>
        <FloatingSourcingButton
          selectedCount={selectedCount}
          isSubmitting={createReviewBatch.isPending}
          onCreate={submitReviewBatch}
        />
      </section>

      <SourcingAgentChat
        candidateCount={candidateRows.length}
        criterionCount={keywordTargets.length + categoryTargets.length}
        selectedCount={selectedCount}
        chatInput={chatInput}
        chatMessages={chatMessages}
        chatLoading={chatLoading}
        onChatInputChange={setChatInput}
        onSubmit={submitChatMessage}
      />
    </div>
  );
}

function SourcingAgentChat({
  candidateCount,
  criterionCount,
  selectedCount,
  chatInput,
  chatMessages,
  chatLoading,
  onChatInputChange,
  onSubmit,
}: {
  candidateCount: number;
  criterionCount: number;
  selectedCount: number;
  chatInput: string;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  onChatInputChange: (value: string) => void;
  onSubmit: (message: string) => void | Promise<void>;
}) {
  return (
    <aside className="min-h-0">
      <section className="flex h-[640px] flex-col overflow-hidden rounded-[22px] border border-[#dbe5f4] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)] xl:h-full xl:min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-[#e4eaf3] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f5ff] text-[#5b52e6]">
              <Bot size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-[#111827]">소싱 에이전트</h2>
              <p className="truncate text-xs font-bold text-[#667085]">1688 상품 소싱 기준을 물어보세요.</p>
            </div>
          </div>
          <span className="rounded-full bg-[#ecfdf3] px-3 py-1.5 text-xs font-black text-[#15803d]">대기중</span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-[#f8fafc] p-4">
          <ChatBubble role="agent">
            소싱 설정 {formatNumber(criterionCount)}개와 1688 매칭 상품 {formatNumber(candidateCount)}개를 보고 있어요. 왼쪽에서 1688 상품을 선택하면 발주 에이전트로 넘길 수 있습니다.
          </ChatBubble>
          <ChatBubble role="agent">
            현재 선택된 1688 상품은 {formatNumber(selectedCount)}개입니다. 쿠팡 상품은 시장 반응 근거로만 사용합니다.
          </ChatBubble>
          <ChatBubble role="agent">
            "발주 후보만", "쿠팡 반응 있는 것만", "선택한 것만", "전체 보기"라고 말하면 왼쪽 결과가 바로 바뀝니다.
          </ChatBubble>
          {chatMessages.map((message) => (
            <ChatBubble key={message.id} role={message.role}>{message.content}</ChatBubble>
          ))}
          {chatLoading && (
            <ChatBubble role="agent">RAG 근거를 찾는 중입니다.</ChatBubble>
          )}
        </div>

        <div className="border-t border-[#e4eaf3] bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={chatLoading}
                onClick={() => onSubmit(prompt)}
                className="rounded-full border border-[#e3eaf5] bg-[#f8fafc] px-3 py-1.5 text-xs font-black text-[#667085] hover:bg-[#f2f5ff] hover:text-[#4e6cf5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2 rounded-2xl border border-[#dbe5f4] bg-[#f8fafc] p-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(chatInput);
            }}
          >
            <input
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-bold text-[#111827] outline-none placeholder:text-[#98a2b3]"
              placeholder="예: 발주 후보만 골라줘"
            />
            <button type="submit" disabled={chatLoading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5b52e6] text-white shadow-[0_10px_20px_rgba(91,82,230,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
              <SendHorizontal size={18} />
            </button>
          </form>
        </div>
      </section>
    </aside>
  );
}

function ChatBubble({ role, children }: { role: ChatMessage['role']; children: ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-full rounded-3xl px-4 py-3 text-sm font-bold leading-6', isUser ? 'bg-[#5b52e6] text-white' : 'border border-[#e4eaf3] bg-white text-[#475467] shadow-sm')}>
        {children}
      </div>
    </div>
  );
}

function FloatingSourcingButton({
  selectedCount,
  isSubmitting,
  onCreate,
}: {
  selectedCount: number;
  isSubmitting: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4 xl:absolute xl:bottom-5 xl:left-0 xl:right-0 xl:px-0">
      <button
        type="button"
        disabled={selectedCount === 0 || isSubmitting}
        onClick={onCreate}
        className={cn(
          'pointer-events-auto inline-flex h-14 items-center justify-center gap-3 rounded-full px-7 text-sm font-black text-white shadow-[0_18px_42px_rgba(91,82,230,0.30)] transition',
          selectedCount > 0 ? 'bg-[#5b52e6] hover:bg-[#4b43d8]' : 'cursor-not-allowed bg-[#aab2c5]',
        )}
      >
        <PackageCheck size={19} />
        발주 에이전트로 보내기
        <span className="rounded-full bg-white/18 px-2.5 py-1 text-xs">{formatNumber(selectedCount)}개</span>
      </button>
    </div>
  );
}

function resolveResultFilter(message: string): ResultFilter | null {
  const normalized = message.replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('전체') || normalized.includes('원래') || normalized.includes('리셋')) return 'all';
  if (normalized.includes('선택')) return 'selected';
  if (normalized.includes('팔') || normalized.includes('판매') || normalized.includes('반응') || normalized.includes('쿠팡')) return 'selling';
  if (normalized.includes('발주') || normalized.includes('검토') || normalized.includes('모델') || normalized.includes('추천')) return 'recommended';
  if (normalized.includes('a급') || normalized.includes('b급') || normalized.includes('고점수') || normalized.includes('좋은')) return 'strong';
  return null;
}

function resolveRagResultFilter(filter: SourcingAgentRagSuggestedFilter | null): ResultFilter | null {
  if (filter === 'all' || filter === 'selected' || filter === 'selling' || filter === 'strong') return filter;
  return null;
}

function formatRagAgentResponse(response: Awaited<ReturnType<typeof querySourcingAgentRag>>): string {
  const sources = response.contexts
    .slice(0, 2)
    .map((context) => context.document.title)
    .filter(Boolean);
  const sourceText = sources.length > 0 ? `근거: ${sources.join(' / ')}.` : null;
  return [
    response.answer,
    sourceText,
    `RAG 문서 ${formatNumber(response.index.documentCount)}개 기준입니다.`,
  ].filter(Boolean).join(' ');
}

function scoreComponent(item: SourcingRecommendationItem, key: string): number {
  const value = item.scoreComponents[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
