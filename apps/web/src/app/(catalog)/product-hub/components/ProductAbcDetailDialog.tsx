'use client';

import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ProductAbcBadge } from '@/components/product-abc/ProductAbcBadge';
import { formatDateTime, formatKRW } from '@/lib/utils';
import type { MasterProductOperationsMetadata } from '@kiditem/shared/product-operations';

type ProductAbcDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: MasterProductOperationsMetadata | null;
  showProductLink?: boolean;
};

const STATUS_LABEL = {
  READY: '계산 완료',
  INSUFFICIENT_EVIDENCE: '관찰 중',
  SOURCE_UNMAPPED: '셀피아 매핑 필요',
  CALIBRATION_PENDING: '수식 보정 대기',
  RECALCULATING: '재계산 중',
  SELLPIA_SOURCE_STALE: '셀피아 원천 갱신 필요',
  AD_SOURCE_STALE: '광고비 원천 갱신 필요',
  ORDERS_SOURCE_STALE: '이전 계산 결과 · 재계산 필요',
  CALCULATION_ERROR: '계산 확인 필요',
} as const;

export function ProductAbcDetailDialog({ open, onOpenChange, product, showProductLink = true }: ProductAbcDetailDialogProps) {
  const evaluation = product?.abcEvaluation ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">ABC 평가 근거</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">{product?.name ?? '선택한 상품'}의 자동 수익성 평가입니다.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>

          {product ? <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
              <ProductAbcBadge grade={product.abcGrade} evaluation={evaluation} showConfidence />
              {showProductLink ? <Link href={`/product-hub/${product.id}`} className="text-sm font-bold text-[var(--primary)] hover:underline">상품 상세 보기</Link> : null}
            </div>

            <section className="rounded-xl border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)]">계산식</h3>
              <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">상품 이익 = 매출 − 주문 시점 매입액 − 광고비 − 판매 수수료 − 출고물류비 − 반품손실 − 기타 변동비</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">현재 판매 수수료·출고물류비·반품손실·기타 변동비는 공식에 포함되며, 원천 연결 전까지 0원(미적용)으로 표시됩니다.</p>
            </section>

            {evaluation ? <>
              <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-[var(--border-subtle)] p-4 sm:grid-cols-2">
                <DetailRow label="평가 상태" value={STATUS_LABEL[evaluation.calculationStatus]} />
                <DetailRow label="수익 데이터 관찰" value={`${evaluation.observationDays}일`} />
                <DetailRow label="이익" value={money(evaluation.weightedContributionProfit)} />
                <DetailRow label="월 환산 이익" value={money(evaluation.profitVelocity30)} />
                <DetailRow label="이익률" value={percent(evaluation.weightedContributionMargin)} />
                <DetailRow label="손실 발생 비율" value={percent(evaluation.lossRecurrence)} />
                <DetailRow label="보정 점수" value={evaluation.adjustedScore === null ? '계산 전' : evaluation.adjustedScore.toFixed(1)} />
                <DetailRow label="계산 시각" value={evaluation.calculatedAt ? formatDateTime(evaluation.calculatedAt) : '아직 계산하지 않음'} />
                <DetailRow label="셀피아 원천" value={sourceValue(evaluation.sourceFreshness.sellpia.status, evaluation.sourceFreshness.sellpia.coverageEndDate)} />
                <DetailRow label="광고비 원천" value={sourceValue(evaluation.sourceFreshness.advertising.status, evaluation.sourceFreshness.advertising.coverageEndDate)} />
                <DetailRow label="상품 매핑" value={evaluation.sourceFreshness.mapping ? `${evaluation.sourceFreshness.mapping.status}${evaluation.sourceFreshness.mapping.inventoryGeneration ? ` · 재고 세대 ${evaluation.sourceFreshness.mapping.inventoryGeneration}` : ''}` : 'STALE'} />
              </dl>

              <section className="rounded-xl border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">비용 증거</h3>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <CostRow label="매출" value={evaluation.costBreakdown.recognizedRevenue} />
                  <CostRow label="주문 시점 매입액" value={evaluation.costBreakdown.orderTimeCogs} />
                  <CostRow label="광고비" value={evaluation.costBreakdown.advertisingSpend} />
                  <CostRow label="판매 수수료" value={evaluation.costBreakdown.marketplaceCommission} />
                  <CostRow label="출고물류비" value={evaluation.costBreakdown.outboundFulfillment} />
                  <CostRow label="반품손실" value={evaluation.costBreakdown.returnLoss} />
                  <CostRow label="기타 변동비" value={evaluation.costBreakdown.otherVariableCost} />
                </dl>
              </section>

              {evaluation.formula ? <section className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">
                <h3 className="font-extrabold text-[var(--text-primary)]">고정 수식 버전</h3>
                <p className="mt-2 text-[var(--text-secondary)]">ABC_V1 · v{evaluation.formula.version} · 반감기 {evaluation.formula.halfLifeDays}일 · 학습 표본 {evaluation.formula.sampleCount}개</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">보정 완료 후에는 같은 수식·정규화 구간·등급 경계를 사용합니다.</p>
              </section> : null}
              {evaluation.statusDetail ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{evaluation.statusDetail}</p> : null}
            </> : <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">아직 ABC 평가 스냅샷이 발행되지 않았습니다. 셀피아 상품별 이익현황과 광고비 원천이 준비되면 자동으로 계산합니다.</p>}
          </div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 text-sm"><dt className="text-[var(--text-tertiary)]">{label}</dt><dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd></div>;
}

function CostRow({ label, value }: { label: string; value: { amount: number | null; status: string } }) {
  return <DetailRow label={label} value={`${value.amount === null ? '확인 필요' : `${formatKRW(value.amount)}원`} · ${value.status}`} />;
}

function money(value: number | null): string { return value === null ? '계산 전' : `${formatKRW(Math.round(value))}원`; }
function percent(value: number | null): string { return value === null ? '계산 전' : `${(value * 100).toFixed(1)}%`; }
function sourceValue(status: string, coverageEndDate: string | null): string { return `${status}${coverageEndDate ? ` · ${coverageEndDate}까지` : ''}`; }
