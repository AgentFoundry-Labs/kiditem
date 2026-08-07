'use client';

import { DatabaseZap, FileCheck2, ListFilter, MessageSquareText } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { BatchContextBar, DecisionChatCardBlock } from './DecisionChatCards';
import type { DecisionChatCard } from '../lib/decision-center-chat';
import type {
  SourcingDecisionCandidateViewModel,
  SourcingDecisionCenterViewModel,
} from '../lib/sourcing-decision-center';

const VIEW_TITLE: Record<DecisionChatCard['kind'], string> = {
  batch: '배치 요약',
  candidate: '후보 판단 근거',
  'candidate-detail': '후보 판단 근거',
  'candidate-list': '후보 비교',
  sources: '데이터 소스 권한',
  intents: '검증 요청함',
};

export interface DecisionWorkspacePanelProps {
  viewModel: SourcingDecisionCenterViewModel;
  activeCard: DecisionChatCard | null;
  selectedCandidateId: string | null;
  canManage: boolean;
  isCreatingIntent: boolean;
  onShowCandidateList: () => void;
  onShowSources: () => void;
  onShowIntents: () => void;
  onOpenCandidateDetail: (candidateId: string) => void;
  onRequestRfq: (candidate: SourcingDecisionCandidateViewModel) => void;
  onRequestSample: (candidate: SourcingDecisionCandidateViewModel) => void;
}

export function DecisionWorkspacePanel({
  viewModel,
  activeCard,
  selectedCandidateId,
  canManage,
  isCreatingIntent,
  onShowCandidateList,
  onShowSources,
  onShowIntents,
  onOpenCandidateDetail,
  onRequestRfq,
  onRequestSample,
}: DecisionWorkspacePanelProps) {
  const hasBatch = viewModel.latestBatch !== null;
  const defaultCandidate = viewModel.candidates[0] ?? null;
  const resolvedCard: DecisionChatCard | null = activeCard
    ?? (defaultCandidate
      ? { kind: 'candidate-detail', candidateId: defaultCandidate.id }
      : hasBatch
        ? { kind: 'batch' }
        : null);
  const effectiveSelectedId = selectedCandidateId ?? defaultCandidate?.id ?? null;

  if (!hasBatch && !resolvedCard) {
    return (
      <section className="order-2 flex min-h-[360px] flex-1 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 xl:order-1 xl:h-full xl:min-h-0">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-quaternary)]">
            <MessageSquareText size={22} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-black text-[var(--text-primary)]">아직 생성된 결정 배치가 없습니다</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-tertiary)]">
            위의 새 분석 키워드 입력란에서 최근 30일 저장 증거를 재생해 후보를 만드세요. 새 데이터 수집은 실행하지 않습니다.
          </p>
        </div>
      </section>
    );
  }

  const shared = {
    viewModel,
    selectedCandidateId: effectiveSelectedId,
    canManage,
    isCreatingIntent,
    onShowCandidateList,
    onOpenCandidateDetail,
    onRequestRfq,
    onRequestSample,
  };

  return (
    <section className="order-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] xl:order-1 xl:h-full">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-[var(--text-primary)]">
              {resolvedCard ? VIEW_TITLE[resolvedCard.kind] : '의사결정 워크스페이스'}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              후보를 비교하고 근거와 다음 검증 단계를 확인합니다.
            </p>
          </div>
          <nav aria-label="의사결정 워크스페이스 보기" className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-1">
            <WorkspaceTab
              label={`후보 ${formatNumber(viewModel.summary.decisionCandidateCount)}`}
              icon={ListFilter}
              active={resolvedCard?.kind === 'candidate-list' || resolvedCard?.kind === 'candidate' || resolvedCard?.kind === 'candidate-detail'}
              onClick={onShowCandidateList}
            />
            <WorkspaceTab
              label={`소스 ${formatNumber(viewModel.summary.sourceEntitlementCount)}`}
              icon={DatabaseZap}
              active={resolvedCard?.kind === 'sources'}
              onClick={onShowSources}
            />
            <WorkspaceTab
              label={`요청 ${formatNumber(viewModel.summary.proposedIntentCount)}`}
              icon={FileCheck2}
              active={resolvedCard?.kind === 'intents'}
              onClick={onShowIntents}
            />
          </nav>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--surface-sunken)] p-4 [scrollbar-width:thin] sm:p-5">
        <BatchContextBar viewModel={viewModel} />
        {resolvedCard && (
          <div className="mt-3">
            <DecisionChatCardBlock card={resolvedCard} {...shared} />
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceTab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof ListFilter;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        active
          ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm'
          : 'text-[var(--text-tertiary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
  );
}
