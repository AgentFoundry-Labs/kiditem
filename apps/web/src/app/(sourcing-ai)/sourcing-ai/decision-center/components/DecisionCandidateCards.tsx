'use client';

import {
  BadgeCheck,
  Ban,
  Box,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Info,
  Loader2,
  PackageSearch,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  describeSourcingCode,
  resolveCandidateActionAvailability,
} from '../lib/decision-center-presenter';
import type { SourcingDecisionCandidateViewModel } from '../lib/sourcing-decision-center';
import type { SupplierOfferSnapshot } from '../lib/sourcing-intelligence-api';

const DECISION_TONE: Record<
  SourcingDecisionCandidateViewModel['decision'],
  { className: string; dot: string }
> = {
  test_order: {
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  hold: {
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
  reject: {
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
  },
};

export function CandidateListCard({
  candidates,
  selectedCandidateId,
  onSelect,
}: {
  candidates: SourcingDecisionCandidateViewModel[];
  selectedCandidateId: string | null;
  onSelect: (candidateId: string) => void;
}) {
  if (candidates.length === 0) {
    return (
      <EmptyCard
        title="판단된 후보가 없습니다"
        description="다른 키워드로 저장 증거를 재생하거나 데이터 소스 권한을 확인해 주세요."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {candidates.map((candidate) => {
        const tone = DECISION_TONE[candidate.decision];
        const isSelected = candidate.id === selectedCandidateId;
        return (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(candidate.id)}
            className={cn(
              'group flex min-h-52 flex-col rounded-2xl border bg-[var(--surface)] p-4 text-left transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transform-none',
              isSelected
                ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]'
                : 'border-[var(--border)] hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-14px_rgba(16,24,40,0.18)]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-[var(--surface-sunken)] px-2 text-sm font-black tabular-nums text-[var(--text-secondary)]">
                #{candidate.rank}
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ring-inset',
                  tone.className,
                )}
              >
                {candidate.decisionLabel}
              </span>
            </div>
            <p className="mt-3 line-clamp-3 text-sm font-black leading-5 text-[var(--text-primary)]">
              {candidate.productName}
            </p>

            <dl className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <CompactMetric label="정책 점수" value={formatNumber(candidate.score)} />
              <CompactMetric
                label="연결된 증거"
                value={`${formatNumber(candidate.evidenceFamilyCount)}종 · ${formatNumber(candidate.evidencePlatformCount)}곳`}
                warning={candidate.evidenceFamilyCount === 0}
              />
              <CompactMetric
                label="공급 오퍼"
                value={candidate.offer ? '연결됨' : '미연결'}
                warning={!candidate.offer}
              />
              <CompactMetric label="판정" value={candidate.decisionLabel} />
            </dl>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs font-bold">
              <span className="text-[var(--text-tertiary)]">
                {candidate.nextEvidenceAction
                  ? describeSourcingCode(candidate.nextEvidenceAction)
                  : '추가 증거 단계 없음'}
              </span>
              <span className="shrink-0 text-[var(--primary)] group-hover:underline">근거 열기</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CandidateDetailCard({
  candidate,
  totalCandidates,
  canManage,
  isCreatingIntent,
  onRequestRfq,
  onRequestSample,
}: {
  candidate: SourcingDecisionCandidateViewModel;
  totalCandidates: number;
  canManage: boolean;
  isCreatingIntent: boolean;
  onRequestRfq: () => void;
  onRequestSample: () => void;
}) {
  const actions = resolveCandidateActionAvailability(candidate, canManage);
  const tone = DECISION_TONE[candidate.decision];
  const reasonItems = candidate.reasonCodes.map(describeSourcingCode);
  const riskItems = candidate.riskCodes.map(describeSourcingCode);
  const sharedBlockReason =
    !actions.rfq.enabled
    && !actions.sample.enabled
    && actions.rfq.reason
    && actions.rfq.reason === actions.sample.reason
      ? actions.rfq.reason
      : null;

  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <PackageSearch size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black tabular-nums text-[var(--text-tertiary)]">
                  후보 #{candidate.rank}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-black ring-1 ring-inset',
                    tone.className,
                  )}
                >
                  {candidate.decisionLabel}
                </span>
              </div>
              {/* 1688 원문 제목은 길다. 2줄로 자르고 전체는 title 로 남긴다. */}
              <h3
                title={candidate.productName}
                className="mt-1 line-clamp-2 max-w-3xl text-base font-black leading-6 text-[var(--text-primary)]"
              >
                {candidate.productName}
              </h3>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">
            <Ban size={14} aria-hidden="true" />
            구매 실행 잠금
          </span>
        </div>

        {/*
          이 후보를 재는 값만 둔다.
          - 구매 실행 잠금은 후보가 아니라 화면 전체의 정책이라 층위가 다르다(헤더 pill 이 알린다).
          - 소스 커버리지는 배치 단위 값이라 배치 바로 옮겼다. 후보 증거가 0 인데 옆에서
            83% 를 보여주면 서로 모순되는 화면이 된다.
        */}
        <dl className="mt-5 grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
          <PrimaryMetric label="정책 점수" value={formatNumber(candidate.score)} description="저장 증거에 정책을 적용한 결과" />
          <PrimaryMetric
            label="연결된 증거"
            value={`${formatNumber(candidate.evidenceFamilyCount)}종 · ${formatNumber(candidate.evidencePlatformCount)}곳`}
            description="이 후보에 실제로 연결된 증거 계열과 독립 플랫폼 수"
          />
          <PrimaryMetric label="배치 내 순위" value={`${candidate.rank} / ${formatNumber(totalCandidates)}`} description="현재 배치 안의 상대 순위" />
        </dl>
      </article>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]" aria-labelledby={`evidence-${candidate.id}`}>
          <SectionTitle id={`evidence-${candidate.id}`} icon={ClipboardCheck} title="판단 근거" description="무엇이 있고, 무엇이 부족한지 확인합니다." />

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <EvidenceStatus label="쿠팡 수요 증거" available={candidate.hasCoupangEvidence} />
            <EvidenceStatus label="1688 공급 증거" available={candidate.has1688Evidence} />
            <EvidenceStatus label="증거 계열" value={`${formatNumber(candidate.evidenceFamilyCount)}종`} />
            <EvidenceStatus label="독립 플랫폼" value={`${formatNumber(candidate.evidencePlatformCount)}곳`} />
          </div>

          {/*
            해야 할 일을 사유 목록보다 먼저 보여준다. 사유는 대부분 부정문이라
            그대로 나열하면 무엇을 먼저 처리해야 하는지 읽히지 않는다.
          */}
          {candidate.nextEvidenceAction && (
            <div className="mt-4 rounded-lg bg-purple-50 px-3 py-3 text-sm text-purple-950 ring-1 ring-inset ring-purple-100">
              <p className="text-xs font-black text-purple-700">다음 증거 단계</p>
              <p className="mt-1 font-bold">{describeSourcingCode(candidate.nextEvidenceAction)}</p>
            </div>
          )}

          <ReasonBlock
            title="정책 판단"
            items={reasonItems}
            empty="추가 정책 보류 사유가 없습니다."
            collapseAfter={3}
          />
          <ReasonBlock title="위험 요인" items={riskItems} empty="기록된 위험 코드가 없습니다." warning />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]" aria-labelledby={`supplier-${candidate.id}`}>
          <SectionTitle id={`supplier-${candidate.id}`} icon={Box} title="공급 검증" description="RFQ와 샘플 요청 전 공급 조건을 확인합니다." />
          <OfferPanel offer={candidate.offer} />
          {candidate.launchCandidate && (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-sunken)] p-3">
              <CompactMetric label="목표 판매가" value={`₩${formatKRW(candidate.launchCandidate.targetSalePriceKrw)}`} />
              <CompactMetric
                label="P10 이익"
                value={candidate.launchCandidate.profitP10Krw == null ? '미산정' : `₩${formatKRW(candidate.launchCandidate.profitP10Krw)}`}
                warning={candidate.launchCandidate.profitP10Krw == null}
              />
            </div>
          )}

          {candidate.latestIntent && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-xs font-bold leading-5 text-emerald-900 ring-1 ring-inset ring-emerald-100">
              <BadgeCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {candidate.latestIntent.intentType === 'request_sample' ? '샘플 요청' : '견적 요청'}이 이미 검토 대기 중입니다.
              </span>
            </div>
          )}

          {/*
            두 요청이 같은 이유로 막히는 경우가 흔하다(예: 공급 오퍼 미연결).
            그때는 사유를 버튼마다 반복하지 않고 그룹 아래 한 번만 적는다.
          */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ActionControl
              reasonId={`rfq-action-reason-${candidate.id}`}
              label="견적 요청(RFQ)"
              enabled={actions.rfq.enabled}
              reason={sharedBlockReason ? null : actions.rfq.reason}
              isPending={isCreatingIntent}
              onClick={onRequestRfq}
            />
            <ActionControl
              reasonId={`sample-action-reason-${candidate.id}`}
              label="샘플 요청"
              enabled={actions.sample.enabled}
              reason={sharedBlockReason ? null : actions.sample.reason}
              isPending={isCreatingIntent}
              onClick={onRequestSample}
            />
          </div>
          {sharedBlockReason && (
            <p
              id={`shared-action-reason-${candidate.id}`}
              className="mt-2 text-xs font-semibold leading-5 text-[var(--text-tertiary)]"
            >
              {sharedBlockReason}
            </p>
          )}

          <p className="mt-4 flex items-start gap-2 border-t border-[var(--border)] pt-3 text-xs font-semibold leading-5 text-[var(--text-tertiary)]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            이 화면은 검토 요청까지만 생성합니다. 테스트 발주·결제·발주서는 생성하지 않습니다.
          </p>
        </section>
      </div>
    </div>
  );
}

function OfferPanel({ offer }: { offer: SupplierOfferSnapshot | null }) {
  if (!offer) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-sunken)] p-4 text-center">
        <TriangleAlert size={20} className="mx-auto text-amber-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-black text-[var(--text-primary)]">연결된 공급 오퍼 없음</p>
        <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">1688 정확 옵션을 연결한 뒤 RFQ·샘플 요청을 검토하세요.</p>
      </div>
    );
  }

  const cheapest = offer.priceTiers.reduce<SupplierOfferSnapshot['priceTiers'][number] | null>(
    (lowest, tier) =>
      lowest === null || Number(tier.unitPriceCny) < Number(lowest.unitPriceCny) ? tier : lowest,
    null,
  );

  return (
    <dl className="mt-4 space-y-2 rounded-lg bg-[var(--surface-sunken)] p-3">
      <OfferTerm label="공급사" value={offer.supplierName ?? '미확인'} />
      <OfferTerm label="정확 옵션" value={offer.identityStatus === 'exact_variant' ? '확정' : '미확정'} good={offer.identityStatus === 'exact_variant'} />
      <OfferTerm label="최소 주문" value={offer.minOrderQuantity == null ? '미확인' : `${formatNumber(offer.minOrderQuantity)}개`} />
      <OfferTerm label="최저 단가" value={cheapest ? `¥${cheapest.unitPriceCny} · ${formatNumber(cheapest.minQuantity)}개부터` : '가격 구간 없음'} />
      <OfferTerm label="샘플" value={offer.sampleAvailable === false ? '불가' : offer.sampleAvailable === true ? '가능' : '확인 필요'} good={offer.sampleAvailable === true} />
    </dl>
  );
}

function ActionControl({
  reasonId,
  label,
  enabled,
  reason,
  isPending,
  onClick,
}: {
  reasonId: string;
  label: string;
  enabled: boolean;
  reason: string | null;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={!enabled || isPending}
        aria-describedby={reason ? reasonId : undefined}
        className={cn(
          'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
          enabled
            ? 'bg-[var(--primary)] text-white hover:brightness-95'
            : 'cursor-not-allowed border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-quaternary)]',
        )}
      >
        {isPending && enabled ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CircleDollarSign size={14} aria-hidden="true" />}
        {label}
      </button>
      {reason && (
        <p id={reasonId} className="mt-1.5 text-xs font-semibold leading-5 text-[var(--text-tertiary)]">
          {reason}
        </p>
      )}
    </div>
  );
}

function SectionTitle({ id, icon: Icon, title, description }: { id: string; icon: typeof Info; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <h4 id={id} className="text-sm font-black text-[var(--text-primary)]">{title}</h4>
        <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  );
}

function EvidenceStatus({ label, available, value }: { label: string; available?: boolean; value?: string }) {
  const resolved = value ?? (available ? '있음' : '없음');
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-2.5">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      <span className={cn('inline-flex items-center gap-1 text-xs font-black', available === false ? 'text-amber-700' : 'text-[var(--text-primary)]')}>
        {available === true && <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />}
        {resolved}
      </span>
    </div>
  );
}

function ReasonBlock({
  title,
  items,
  empty,
  warning = false,
  collapseAfter,
}: {
  title: string;
  items: string[];
  empty: string;
  warning?: boolean;
  /** 이 개수를 넘는 항목은 접어 둔다. 사유가 열 줄 가까이 쌓여도 스캔되게 한다. */
  collapseAfter?: number;
}) {
  const visible = collapseAfter == null ? items : items.slice(0, collapseAfter);
  const hidden = collapseAfter == null ? [] : items.slice(collapseAfter);

  return (
    <div className="mt-4">
      <p className="text-xs font-black text-[var(--text-secondary)]">{title}</p>
      {items.length > 0 ? (
        <>
          <ReasonItems items={visible} warning={warning} />
          {hidden.length > 0 && (
            <details className="group mt-1.5">
              <summary className="cursor-pointer list-none text-xs font-black text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
                <span className="group-open:hidden">사유 {hidden.length}개 더 보기</span>
                <span className="hidden group-open:inline">접기</span>
              </summary>
              <ReasonItems items={hidden} warning={warning} />
            </details>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[var(--text-quaternary)]">{empty}</p>
      )}
    </div>
  );
}

function ReasonItems({ items, warning }: { items: string[]; warning: boolean }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}:${index}`} className={cn('flex items-start gap-2 text-xs font-semibold leading-5', warning ? 'text-amber-900' : 'text-[var(--text-secondary)]')}>
          <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', warning ? 'bg-amber-500' : 'bg-slate-400')} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * 지표 타일. 숫자를 화면의 초점으로 두고 라벨·설명은 뒤로 물린다.
 * 라벨 앞 사각 불릿은 이 화면 전체에서 "지표"를 가리키는 공통 신호다.
 */
function PrimaryMetric({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-4">
      <dt className="flex items-center gap-1.5 text-[11px] font-black text-[var(--text-tertiary)]">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-[var(--primary)]" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-black leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
        {value}
      </dd>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-[var(--text-quaternary)]">{description}</p>
    </div>
  );
}

function CompactMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-tertiary)]">
        <span className="h-1 w-1 rounded-[1px] bg-[var(--text-quaternary)]" aria-hidden="true" />
        {label}
      </dt>
      <dd className={cn('mt-1 text-sm font-black tabular-nums', warning ? 'text-amber-700' : 'text-[var(--text-primary)]')}>{value}</dd>
    </div>
  );
}

function OfferTerm({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</dt>
      <dd className={cn('text-right text-xs font-black', good ? 'text-emerald-700' : 'text-[var(--text-primary)]')}>{value}</dd>
    </div>
  );
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
      <PackageSearch size={36} className="mx-auto text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-black text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{description}</p>
    </div>
  );
}
