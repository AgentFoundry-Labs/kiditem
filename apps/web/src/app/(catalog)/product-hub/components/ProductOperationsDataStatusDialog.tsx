'use client';

import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsDataStatus,
} from '@kiditem/shared/product-operations';
import {
  SOURCE_READINESS_LABELS,
  sourceReadinessStatus,
} from '@kiditem/shared/source-readiness';
import { formatDateTime, formatNumber } from '@/lib/utils';

function sourceLabel(source: ProductOperationsDataSourceStatus): string {
  return SOURCE_READINESS_LABELS[sourceReadinessStatus(source)];
}

export type ProductOperationsDataStatusFeedback = {
  tone: 'success' | 'warning' | 'error';
  message: string;
};

export function ProductOperationsDataStatusDialog({
  open,
  onOpenChange,
  data,
  loading,
  error,
  refreshing,
  checking,
  feedback,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ProductOperationsDataStatus | undefined;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  /**
   * A read of the data status is in flight, so the source dates on screen may
   * be older than the server's. The grade refresh waits for it; source
   * readiness never holds it, because the server publishes the newest pair
   * that ends together, as the dashboard's refresh does.
   */
  checking: boolean;
  feedback?: ProductOperationsDataStatusFeedback | null;
  onRefresh: () => void;
}) {
  const sourcesReady = data !== undefined
    && data.sources.sellpia.ready
    && data.sources.advertising.ready
    && data.sources.mapping.ready;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">상품 운영 데이터 현황</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">현재 원천과 마지막 공식 ABC 발행 기준을 확인합니다.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>

          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]"><Loader2 className="animate-spin" size={18} />현황을 불러오는 중입니다.</div> : null}
          {error ? <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">데이터 현황을 불러오지 못했습니다.</p> : null}
          {data ? <div className="mt-5 space-y-4">
            <section className="grid gap-2 rounded-xl border border-[var(--border-subtle)] p-4 text-sm sm:grid-cols-2">
              <Cutoff label="공식 등급 기준일" value={data.officialCutoff} />
              <Cutoff label="표시 데이터 기준일" value={data.actualCutoff} />
              <Cutoff label="화면 전체 기준일" value={data.displayDataAsOf} />
              <p className="text-[var(--text-tertiary)]">발행 {data.publishedAt ? formatDateTime(data.publishedAt) : '없음'} · 수식 r{data.formulaRevision} · 발행 r{data.publicationRevision}</p>
            </section>

            <section className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
              <SourceRow label="방문·조회" source={data.sources.traffic} />
              <SourceRow label="주문·판매·매출" source={data.sources.orders} />
              <SourceRow label="광고비" source={data.sources.advertising} />
              <SourceRow label="Sellpia 이익" source={data.sources.sellpia} />
              <MappingRow ready={data.sources.mapping.ready} generation={data.sources.mapping.generation} />
            </section>

            {!sourcesReady ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">필수 원천이 최신이 아니면 셀피아 상품 손익과 광고 손익이 함께 도달한 날짜까지만 발행합니다. 그런 날짜가 없으면 기존 공식 등급을 유지합니다.</p> : null}
            {feedback ? <p role="status" className={feedbackClass(feedback.tone)}>{feedback.message}</p> : null}

            <section className="rounded-xl border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)]">ABC 등급 현황</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Count label="등급 산정" value={data.abcSummary.classifiedProductCount} />
                <Count label="등급 미산정" value={data.abcSummary.unclassifiedProductCount} />
                <Count label="매핑 확인 필요" value={data.abcSummary.mappingRequiredProductCount} />
                <Count label="기타 대기" value={data.abcSummary.otherPendingProductCount} />
              </dl>
              <Link href="/product-hub/matching" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">상품 매핑 확인 <ExternalLink size={12} /></Link>
            </section>

            <div className="flex justify-end rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
              <button type="button" onClick={onRefresh} disabled={refreshing || checking} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-bold text-white disabled:opacity-50">
                {refreshing || checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {refreshing ? '계산 중' : checking ? '현황 확인 중' : '등급 새로고침'}
              </button>
            </div>
          </div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SourceRow({
  label,
  source,
}: {
  label: string;
  source: ProductOperationsDataSourceStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[92px] text-sm font-extrabold text-[var(--text-primary)]">{label}</div>
      <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">{sourceLabel(source)}</span>
      <div className="min-w-0 flex-1 text-right text-xs text-[var(--text-tertiary)]">
        <p>{source.actualCutoff ? `${source.actualCutoff}까지` : '수집 기준일 없음'}</p>
      </div>
    </div>
  );
}

function MappingRow({
  ready,
  generation,
}: {
  ready: boolean;
  generation: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[92px] text-sm font-extrabold text-[var(--text-primary)]">상품 매핑</div>
      <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">{ready ? '최신' : '갱신 필요'}</span>
      <p className="min-w-0 flex-1 text-right text-xs text-[var(--text-tertiary)]">{generation ? `세대 ${generation}` : '매핑 세대 없음'}</p>
    </div>
  );
}

function Cutoff({ label, value }: { label: string; value: string | null }) {
  return <p className="font-semibold text-[var(--text-secondary)]">{label} {value ?? '없음'}</p>;
}

function feedbackClass(tone: ProductOperationsDataStatusFeedback['tone']): string {
  if (tone === 'success') return 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800';
  if (tone === 'warning') return 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800';
  return 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800';
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2"><dt className="text-[11px] font-bold text-[var(--text-tertiary)]">{label}</dt><dd className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(value)}</dd></div>;
}
