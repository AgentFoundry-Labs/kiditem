'use client';

import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DatabaseZap,
  FileCheck2,
  Info,
  Layers3,
} from 'lucide-react';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  describeSourcingCode,
  formatBatchSourceCoverage,
} from '../lib/decision-center-presenter';
import { CandidateDetailCard, CandidateListCard } from './DecisionCandidateCards';
import type { DecisionChatCard } from '../lib/decision-center-chat';
import type {
  SourcingDecisionCandidateViewModel,
  SourcingDecisionCenterViewModel,
} from '../lib/sourcing-decision-center';

export interface DecisionChatCardsProps {
  card: DecisionChatCard;
  viewModel: SourcingDecisionCenterViewModel;
  selectedCandidateId: string | null;
  canManage: boolean;
  isCreatingIntent: boolean;
  onShowCandidateList: () => void;
  onOpenCandidateDetail: (candidateId: string) => void;
  onRequestRfq: (candidate: SourcingDecisionCandidateViewModel) => void;
  onRequestSample: (candidate: SourcingDecisionCandidateViewModel) => void;
}

export function DecisionChatCardBlock({
  card,
  viewModel,
  selectedCandidateId,
  canManage,
  isCreatingIntent,
  onShowCandidateList,
  onOpenCandidateDetail,
  onRequestRfq,
  onRequestSample,
}: DecisionChatCardsProps) {
  if (card.kind === 'candidate-detail' || card.kind === 'candidate') {
    const candidate = viewModel.candidates.find(({ id }) => id === card.candidateId);
    if (!candidate) return null;
    return (
      <CandidateDetailCard
        candidate={candidate}
        totalCandidates={viewModel.candidates.length}
        canManage={canManage}
        isCreatingIntent={isCreatingIntent}
        onRequestRfq={() => onRequestRfq(candidate)}
        onRequestSample={() => onRequestSample(candidate)}
      />
    );
  }
  if (card.kind === 'batch') {
    return <BatchOverviewCard viewModel={viewModel} onShowCandidates={onShowCandidateList} />;
  }
  if (card.kind === 'candidate-list') {
    return (
      <CandidateListCard
        candidates={viewModel.candidates}
        selectedCandidateId={selectedCandidateId}
        onSelect={onOpenCandidateDetail}
      />
    );
  }
  if (card.kind === 'sources') return <SourceStatusCard viewModel={viewModel} />;
  return <IntentListCard viewModel={viewModel} />;
}

export function BatchContextBar({ viewModel }: { viewModel: SourcingDecisionCenterViewModel }) {
  const batch = viewModel.latestBatch;
  if (!batch) return null;
  const coverage = formatBatchSourceCoverage(viewModel.batchSourceCoverage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0">
          {/* 키워드만 크게 두면 그게 무엇인지 읽히지 않는다. 라벨을 붙여 둔다. */}
          <p className="text-[10px] font-black tracking-[0.12em] text-[var(--text-quaternary)]">
            분석 키워드
          </p>
          <p className="truncate text-sm font-black text-[var(--text-primary)]">
            {batch.keyword || '키워드 미지정'}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-tertiary)]">
            배치 {shortBatchKey(batch.batchKey)} · {formatDateTime(batch.decisionAt, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <BatchStatePill state={viewModel.batchState} batchStatus={batch.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        {/*
          소스 커버리지는 이 배치(키워드) 단위 값이다. 후보 카드가 아니라 여기에 둔다.
        */}
        <span
          title={coverage.description}
          className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]"
        >
          <Layers3 size={13} aria-hidden="true" />
          {coverage.label} {coverage.value}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
          <Clock3 size={13} aria-hidden="true" />
          <ExpiryText expiresAt={batch.expiresAt} />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-slate-700 ring-1 ring-inset ring-slate-200">
          <Ban size={12} aria-hidden="true" />
          구매 실행 잠금
        </span>
      </div>
    </div>
  );
}

function BatchOverviewCard({
  viewModel,
  onShowCandidates,
}: {
  viewModel: SourcingDecisionCenterViewModel;
  onShowCandidates: () => void;
}) {
  const batch = viewModel.latestBatch;
  if (!batch) return null;
  const { testOrderCount, holdCount, rejectCount, decisionCandidateCount } = viewModel.summary;

  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-[var(--text-tertiary)]">최근 Shadow 판단</p>
          <h3 className="mt-1 text-lg font-black text-[var(--text-primary)]">{batch.keyword || '키워드 미지정'}</h3>
          <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
            최근 30일 저장 증거를 재생한 결과이며 새 수집 상태를 뜻하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowCandidates}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          후보 {formatNumber(decisionCandidateCount)}개 보기
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-5 grid gap-2 sm:grid-cols-3">
        <VerdictTally label="테스트 검증 후보" count={testOrderCount} tone="emerald" />
        <VerdictTally label="보류" count={holdCount} tone="amber" />
        <VerdictTally label="제외" count={rejectCount} tone="rose" />
      </dl>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-xs font-semibold leading-5 text-slate-700 ring-1 ring-inset ring-slate-200">
        <Ban size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        테스트 검증 후보는 구매 승인이 아닙니다. 이 화면에서는 RFQ·샘플 검토 요청까지만 생성합니다.
      </div>
    </CardShell>
  );
}

function SourceStatusCard({ viewModel }: { viewModel: SourcingDecisionCenterViewModel }) {
  const tone: Record<string, string> = {
    decision_eligible: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    shadow_only: 'bg-purple-50 text-purple-700 ring-purple-200',
    pending: 'bg-amber-50 text-amber-800 ring-amber-200',
    blocked: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  const label: Record<string, string> = {
    decision_eligible: '결정 사용 가능',
    shadow_only: 'Shadow 전용',
    pending: '검토 대기',
    blocked: '차단',
  };

  return (
    <CardShell>
      <CardHeading
        icon={DatabaseZap}
        title="데이터 소스 권한"
        description="아래 상태는 사용 권한 계약이며, 최신 수집 Run 성공 여부는 아닙니다."
      />
      {viewModel.sourceEntitlements.length === 0 ? (
        <p className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-4 text-xs font-semibold text-[var(--text-tertiary)]">
          등록된 소스 권한이 없습니다.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {viewModel.sourceEntitlements.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--text-primary)]">{source.sourceKey}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
                  {source.ownerLabel} · 범위 {source.scopeKey}
                </p>
                {source.entitlementBlockReason && (
                  <p className="mt-1 text-xs font-bold text-amber-800">
                    {describeSourcingCode(source.entitlementBlockReason)}
                  </p>
                )}
              </div>
              <span className={cn('shrink-0 rounded-md px-2 py-1 text-[10px] font-black ring-1 ring-inset', tone[source.entitlementEligibility])}>
                {label[source.entitlementEligibility]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function IntentListCard({ viewModel }: { viewModel: SourcingDecisionCenterViewModel }) {
  const intents = Array.from(
    new Map(
      viewModel.candidates
        .map(({ latestIntent, productName, rank }) => latestIntent ? [latestIntent.id, { ...latestIntent, productName, rank }] as const : null)
        .filter((entry): entry is readonly [string, NonNullable<typeof entry>[1]] => entry !== null),
    ).values(),
  );

  return (
    <CardShell>
      <CardHeading
        icon={FileCheck2}
        title="검증 요청함"
        description={`검토 대기 ${formatNumber(viewModel.summary.proposedIntentCount)}건 · 구매 주문은 포함되지 않습니다.`}
      />
      {intents.length === 0 ? (
        <p className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-4 text-xs font-semibold text-[var(--text-tertiary)]">
          현재 배치 후보에 연결된 검증 요청이 없습니다.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {intents.map((intent) => (
            <li key={intent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-[var(--text-primary)]">
                  #{intent.rank} {intent.productName}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-tertiary)]">
                  {intent.intentType === 'request_sample' ? '샘플 요청' : '견적 요청(RFQ)'} · {formatDateTime(intent.createdAt)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 size={11} aria-hidden="true" />
                검토 대기
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">{children}</div>;
}

function CardHeading({ icon: Icon, title, description }: { icon: typeof Info; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-black text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  );
}

function VerdictTally({ label, count, tone }: { label: string; count: number; tone: 'emerald' | 'amber' | 'rose' }) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-800',
  }[tone];
  return (
    <div className={cn('rounded-lg px-3 py-3', toneClass)}>
      <dt className="text-xs font-bold">{label}</dt>
      <dd className="mt-1 text-xl font-black tabular-nums">{formatNumber(count)}</dd>
    </div>
  );
}

function BatchStatePill({ state, batchStatus }: { state: SourcingDecisionCenterViewModel['batchState']; batchStatus: string }) {
  const tone = {
    investigation: { label: batchStatus === 'shadow' ? 'Shadow 검증' : '검토 가능', className: 'bg-purple-50 text-purple-700 ring-purple-200' },
    expired: { label: '만료', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
    inactive: { label: '비활성', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
    missing: { label: '없음', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  }[state];
  return <span className={cn('rounded-md px-2 py-1 text-[10px] font-black ring-1 ring-inset', tone.className)}>{tone.label}</span>;
}

function ExpiryText({ expiresAt }: { expiresAt: string }) {
  const remainingMs = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remainingMs)) return <span>만료 시각 미상</span>;
  if (remainingMs <= 0) return <span className="text-rose-700">만료됨</span>;
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return <span>만료까지 {hours > 0 ? `${hours}시간 ` : ''}{minutes}분</span>;
}

function shortBatchKey(batchKey: string): string {
  return batchKey.length > 12 ? `${batchKey.slice(0, 8)}…` : batchKey;
}
