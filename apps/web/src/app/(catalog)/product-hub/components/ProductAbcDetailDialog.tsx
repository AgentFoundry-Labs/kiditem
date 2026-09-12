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
  SOURCE_UNMAPPED: '상품 매핑 필요',
  SELLPIA_SOURCE_STALE: 'Sellpia 원천 갱신 필요',
  AD_SOURCE_STALE: '광고비 원천 갱신 필요',
} as const;

export function ProductAbcDetailDialog({ open, onOpenChange, product, showProductLink = true }: ProductAbcDetailDialogProps) {
  const evaluation = product?.abc.evaluation ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">ABC 평가 근거</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">{product?.name ?? '선택한 상품'}의 마지막 공식 평가와 현재 원천 상태입니다.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>

          {product ? <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
              <ProductAbcBadge grade={product.abc.abcGrade} evaluation={evaluation} showConfidence />
              {showProductLink ? <Link href={`/product-hub/${product.id}`} className="text-sm font-bold text-[var(--primary)] hover:underline">상품 상세 보기</Link> : null}
            </div>

            <section className="rounded-xl border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)]">발행 상태</h3>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <DetailRow label="평가 상태" value={STATUS_LABEL[product.abc.displayStatus]} />
                <DetailRow label="공식 등급 기준일" value={product.abc.officialCutoffDate ?? '없음'} />
                <DetailRow label="표시 데이터 기준일" value={product.abc.actualCutoffDate ?? '없음'} />
                <DetailRow label="발행 시각" value={product.abc.publishedAt ? formatDateTime(product.abc.publishedAt) : '없음'} />
                <DetailRow label="수식 리비전" value={String(product.abc.formulaRevision)} />
                <DetailRow label="발행 리비전" value={String(product.abc.publicationRevision)} />
              </dl>
            </section>

            {evaluation ? <>
              <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-[var(--border-subtle)] p-4 sm:grid-cols-2">
                <DetailRow label="수익 데이터 관찰" value={`${evaluation.validObservationDays}일`} />
                <DetailRow label="기간 실제 이익" value={money(product.contribution?.operatingProfit ?? null)} />
                <DetailRow label="공식 가중 이익" value={money(evaluation.weightedOperatingProfit)} />
                <DetailRow label="30일 환산 이익" value={money(evaluation.operatingProfitVelocity30)} />
                <DetailRow label="영업이익률" value={percent(evaluation.operatingMargin)} />
                <DetailRow label="손실 지속률" value={percent(evaluation.lossPersistence)} />
                <DetailRow label="경제 점수" value={evaluation.economicScore.toFixed(1)} />
                <DetailRow label="계산 시각" value={formatDateTime(evaluation.calculatedAt)} />
                <DetailRow label="Sellpia 원천" value={sourceValue(product.abc.sources.sellpia, product.abc.sources.sellpia.actualCutoffDate)} />
                <DetailRow label="광고비 원천" value={sourceValue(product.abc.sources.advertising, product.abc.sources.advertising.actualCutoffDate)} />
                <DetailRow label="상품 매핑" value={`${product.abc.sources.mapping.status}${product.abc.sources.mapping.mappingGeneration ? ` · 세대 ${product.abc.sources.mapping.mappingGeneration}` : ''}`} />
              </dl>

              <section className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">
                <h3 className="font-extrabold text-[var(--text-primary)]">고정 수식 버전</h3>
                <p className="mt-2 text-[var(--text-secondary)]">{evaluation.formula.formulaKey} · v{evaluation.formula.version} · 반감기 {evaluation.formula.halfLifeDays}일</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">마지막 발행의 공식 평가를 유지하며 현재 원천 상태는 별도로 표시합니다.</p>
              </section>
            </> : <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">아직 공식 ABC 평가가 발행되지 않았습니다. 원천과 상품 매핑이 준비되면 상품 운영 센터에서 등급을 새로고침할 수 있습니다.</p>}
          </div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 text-sm"><dt className="text-[var(--text-tertiary)]">{label}</dt><dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd></div>;
}

function money(value: number | null): string { return value === null ? '계산 전' : `${formatKRW(Math.round(value))}원`; }
function percent(value: number | null): string { return value === null ? '계산 전' : `${(value * 100).toFixed(1)}%`; }
function sourceValue(source: { ready: boolean; sourceImportRunId: string | null }, cutoff: string | null): string {
  const state = source.ready ? '최신' : source.sourceImportRunId ? '갱신 필요' : '미수집';
  return `${state}${cutoff ? ` · ${cutoff}까지` : ''}`;
}
