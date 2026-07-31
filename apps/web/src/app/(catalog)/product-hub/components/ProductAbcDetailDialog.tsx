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

const LIFECYCLE_LABELS = {
  NEW: '신상품 관찰 중',
  PROVISIONAL: '예비 등급',
  ESTABLISHED: '정식 평가',
} as const;

const CONFIDENCE_LABELS = {
  LOW: '낮음',
  MEDIUM: '보통',
  HIGH: '높음',
} as const;

const REASON_LABELS = {
  ELIGIBLE: '평가 가능',
  INACTIVE_PRODUCT: '비활성 상품',
  MISSING_RECIPE: '재고 연결 필요',
  SHARED_SKU: '공유 SKU라 단일 상품 이익을 확정할 수 없음',
  INACTIVE_SKU: '비활성 Sellpia SKU',
  INCOMPLETE_MONTHS: '완료 월 데이터 부족',
  MISSING_COST: '주문 시점 원가 누락',
  NO_OBSERVATION: '판매 관찰 데이터 없음',
} as const;

export function ProductAbcDetailDialog({
  open,
  onOpenChange,
  product,
  showProductLink = true,
}: ProductAbcDetailDialogProps) {
  const evaluation = product?.abcEvaluation ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">ABC 평가 근거</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                {product?.name ?? '선택한 상품'}의 자동 ABC 평가 상태입니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>

          {product ? (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
                <ProductAbcBadge grade={product.abcGrade} evaluation={evaluation} showConfidence />
                {showProductLink ? <Link href={`/product-hub/${product.id}`} className="text-sm font-bold text-[var(--primary)] hover:underline">상품 상세 보기</Link> : null}
              </div>

              <section className="rounded-xl border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">평가 기준</h3>
                <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">매출총이익 = 결제금액 - 주문 시점 매입금액</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">광고비·마켓 수수료·배송비·반품비는 포함하지 않습니다.</p>
              </section>

              {evaluation ? (
                <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-[var(--border-subtle)] p-4 sm:grid-cols-2">
                  <DetailRow label="평가 단계" value={LIFECYCLE_LABELS[evaluation.lifecycleStage]} />
                  <DetailRow label="신뢰도" value={CONFIDENCE_LABELS[evaluation.confidence]} />
                  <DetailRow label="관찰 완료 월" value={`${evaluation.observedCompleteMonths}개월`} />
                  <DetailRow label="관찰 시작 월" value={evaluation.observationStartMonth ?? '관찰 전'} />
                  <DetailRow label="평가 상태" value={REASON_LABELS[evaluation.eligibilityReason]} />
                  <DetailRow label="매출총이익" value={evaluation.grossProfit === null ? '집계 전' : `${formatKRW(evaluation.grossProfit)}원`} />
                  <DetailRow label="결제금액" value={evaluation.grossRevenue === null ? '집계 전' : `${formatKRW(evaluation.grossRevenue)}원`} />
                  <DetailRow label="주문 시점 매입금액" value={evaluation.grossCost === null ? '집계 전' : `${formatKRW(evaluation.grossCost)}원`} />
                  <DetailRow label="계산 시각" value={evaluation.calculatedAt ? formatDateTime(evaluation.calculatedAt) : '아직 계산하지 않음'} />
                  <DetailRow label="원본 수집 시각" value={evaluation.sourceCapturedAt ? formatDateTime(evaluation.sourceCapturedAt) : '수집 시각 없음'} />
                </dl>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  아직 ABC 평가 스냅샷이 발행되지 않았습니다. Sellpia 주문·원가 수집과 재계산이 완료되면 자동으로 표시됩니다.
                </p>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
