'use client';

import { ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import type { CostConfidence, SourceOffer, SourcingDecisionRow } from '../lib/sourcing-ai-dashboard';

interface SourceCandidateModalProps {
  row: SourcingDecisionRow | null;
  onClose: () => void;
}

export function SourceCandidateModal({ row, onClose }: SourceCandidateModalProps) {
  if (!row) return null;

  const selectedOffer = row.source;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black text-[var(--primary)]">해외 상품 후보 선택</p>
            <h2 className="mt-1 truncate text-lg font-black text-[var(--text-primary)]">
              {row.keyword}
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
              쿠팡 데이터 {row.demand.freshness} · 후보 {row.sourceCandidates.length}개
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)]"
            aria-label="닫기"
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[280px_1fr_320px]">
          <aside className="border-b border-[var(--border-subtle)] p-4 xl:border-b-0 xl:border-r">
            <h3 className="text-sm font-black text-[var(--text-primary)]">한국 시장 요약</h3>
            <div className="mt-3 space-y-2">
              <InfoLine label="상품군" value={row.category} />
              <InfoLine label="쿠팡 결과" value={`${formatNumber(row.demand.registeredProducts)}개`} />
              <InfoLine label="최근 등록" value={`+${formatNumber(row.demand.newProductDelta)}`} />
              <InfoLine label="리뷰 증가" value={`+${formatNumber(row.demand.reviewDelta)}`} />
              <InfoLine label="평균 판매가" value={formatKRW(row.demand.avgSalePrice)} />
              <InfoLine label="판단 점수" value={`${row.score}점`} />
            </div>
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
              <p className="text-xs font-black text-[var(--text-primary)]">시장 신호</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
                {row.demand.signal}
              </p>
            </div>
          </aside>

          <div className="border-b border-[var(--border-subtle)] p-4 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-[var(--text-primary)]">1688 / 타오바오 후보</h3>
              <span className="text-xs font-bold text-[var(--text-tertiary)]">추천순</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-1">
              {row.sourceCandidates.map((offer) => (
                <OfferCard key={offer.id} offer={offer} selected={offer.id === selectedOffer.id} />
              ))}
            </div>
          </div>

          <aside className="p-4">
            <h3 className="text-sm font-black text-[var(--text-primary)]">선택 상품 원가</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <img src={selectedOffer.imageUrl} alt="" className="h-36 w-full object-cover" />
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-black text-[var(--text-primary)]">
                  {selectedOffer.title}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">
                  {selectedOffer.platform} · MOQ {formatNumber(selectedOffer.moq)}개
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <CostLine label="상품 단가" value={`${selectedOffer.priceCny.toFixed(1)} CNY`} />
              <CostLine label="중국 배송" value={`${selectedOffer.chinaShippingCny.toFixed(1)} CNY`} />
              <CostLine label="구매/대행 수수료" value={formatKRW(selectedOffer.serviceFeeKrw)} />
              <CostLine label="국제 배송" value={formatKRW(selectedOffer.internationalShippingKrw)} />
              <CostLine label="관부가세 추정" value={formatKRW(selectedOffer.taxEstimateKrw)} />
              <CostLine label="검수/포장" value={formatKRW(selectedOffer.inspectionFeeKrw)} />
            </div>

            <div className="mt-4 rounded-lg bg-[var(--primary-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-[var(--primary)]">한국 입고 원가</span>
                <CostConfidenceBadge value={selectedOffer.costConfidence} />
              </div>
              <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">
                {formatKRW(selectedOffer.landedCostKrw)}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                {selectedOffer.recommendation}
              </p>
            </div>

            <button
              type="button"
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-black text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)]"
            >
              이 상품 선택
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

function OfferCard({ offer, selected }: { offer: SourceOffer; selected: boolean }) {
  return (
    <article
      className={cn(
        'rounded-lg border bg-[var(--surface-raised)] p-3',
        selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary-soft)]' : 'border-[var(--border-subtle)]',
      )}
    >
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-black text-white">
            <ImageIcon size={10} />
            {offer.imageCount}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-black text-[var(--primary)]">
              {offer.platform}
            </span>
            {selected && <span className="text-[10px] font-black text-emerald-700">추천</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-black leading-5 text-[var(--text-primary)]">
            {offer.title}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <MiniValue label="원가" value={`${offer.priceCny.toFixed(1)}`} />
        <MiniValue label="MOQ" value={formatNumber(offer.moq)} />
        <MiniValue label="옵션" value={formatNumber(offer.optionCount)} />
        <MiniValue label="입고" value={formatKRW(offer.landedCostKrw)} />
      </div>
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-black text-[var(--text-primary)] transition hover:border-[var(--primary)]"
      >
        <ExternalLink size={13} />
        원본 보기
      </a>
    </article>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="text-xs font-bold text-[var(--text-muted)]">{label}</span>
      <span className="text-xs font-black text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function CostLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-bold text-[var(--text-muted)]">{label}</span>
      <span className="font-black text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5">
      <p className="text-[10px] font-bold text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function CostConfidenceBadge({ value }: { value: CostConfidence }) {
  const labels: Record<CostConfidence, string> = {
    confirmed: '확정',
    estimated: '추정',
    missing: '누락',
  };

  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-xs font-black',
        value === 'confirmed' && 'bg-emerald-100 text-emerald-700',
        value === 'estimated' && 'bg-amber-100 text-amber-700',
        value === 'missing' && 'bg-rose-100 text-rose-700',
      )}
    >
      {labels[value]}
    </span>
  );
}
