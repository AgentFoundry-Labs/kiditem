'use client';

import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsDataStatus,
} from '@kiditem/shared/product-operations';
import { formatDateTime, formatNumber } from '@/lib/utils';

const STATUS_LABEL: Record<ProductOperationsDataSourceStatus['status'], string> = {
  CURRENT: '최신',
  OUTDATED: '갱신 필요',
  NOT_COLLECTED: '미수집',
  UPDATING: '갱신 중',
  ACTION_REQUIRED: '확인 필요',
  FAILED: '실패',
};

export function ProductOperationsDataStatusDialog({
  open,
  onOpenChange,
  data,
  loading,
  error,
  refreshing,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ProductOperationsDataStatus | undefined;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const refreshDisabled = refreshing || data?.activeRun != null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] max-h-[92vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">상품 운영 데이터 현황</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">화면의 숫자와 ABC 등급이 어느 시점의 원천을 기준으로 하는지 확인합니다.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>

          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]"><Loader2 className="animate-spin" size={18} />현황을 불러오는 중입니다.</div> : null}
          {error ? <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">데이터 현황을 불러오지 못했습니다.</p> : null}
          {data ? <div className="mt-5 space-y-4">
            {data.activeRun ? (
              <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-blue-800"><Loader2 size={15} className="animate-spin" />수익성 데이터 갱신 중</div>
                <p className="mt-1 text-xs text-blue-700">{data.activeRun.title}{data.activeRun.progress == null ? '' : ` · ${Math.round(data.activeRun.progress * 100)}%`}</p>
              </section>
            ) : null}

            <section className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
              <SourceRow label="판매 지표" source={data.sources.traffic} recoveryHref="/settings" recoveryLabel="트래픽 업로드" />
              <SourceRow label="광고비" source={data.sources.advertising} />
              <SourceRow label="상품별 이익" source={data.sources.sellpiaProfit} />
              <SourceRow label="ABC 등급" source={data.sources.abc} />
            </section>

            <section className="rounded-xl border border-[var(--border-subtle)] p-4">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)]">ABC 등급 현황</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Count label="등급 산정" value={data.abcSummary.classifiedProductCount} />
                <Count label="등급 미산정" value={data.abcSummary.unclassifiedProductCount} />
                <Count label="매핑 확인 필요" value={data.abcSummary.mappingRequiredProductCount} />
                <Count label="기타 대기" value={data.abcSummary.otherPendingProductCount} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
                <Link href="/product-hub/matching" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">상품 매핑 확인 <ExternalLink size={12} /></Link>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
              <div className="text-xs text-[var(--text-tertiary)]">
                <p>화면 기준 {data.displayDataAsOf ?? '없음'}</p>
                <p>최근 완료 {data.lastCompletedRefreshAt ? formatDateTime(data.lastCompletedRefreshAt) : '없음'}</p>
              </div>
              <button type="button" onClick={onRefresh} disabled={refreshDisabled} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-bold text-white disabled:opacity-50">
                {refreshDisabled ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {data.activeRun ? '갱신 중' : refreshing ? '요청 중' : '수익성 데이터 갱신'}
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
  recoveryHref,
  recoveryLabel,
}: {
  label: string;
  source: ProductOperationsDataSourceStatus;
  recoveryHref?: string;
  recoveryLabel?: string;
}) {
  const attention = source.status === 'ACTION_REQUIRED'
    ? sourceAttention(source.attentionReason)
    : null;
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[92px] text-sm font-extrabold text-[var(--text-primary)]">{label}</div>
      <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">{attention?.label ?? STATUS_LABEL[source.status]}</span>
      <div className="min-w-0 flex-1 text-right text-xs text-[var(--text-tertiary)]">
        <p>{source.coverageEndDate ? `${source.coverageEndDate}까지` : '수집 기준일 없음'}</p>
        <p>{source.capturedAt ? formatDateTime(source.capturedAt) : '수집 시각 없음'}</p>
      </div>
      {recoveryHref && recoveryLabel ? <Link href={recoveryHref} className="text-xs font-bold text-[var(--primary)] hover:underline">{recoveryLabel}</Link> : null}
      {attention ? <p className="basis-full text-xs font-bold text-amber-700">{attention.message}</p> : null}
    </div>
  );
}

function sourceAttention(reason?: string | null): { label: string; message: string } {
  if (reason === 'marketplace_login') {
    return {
      label: '로그인 필요',
      message: '쿠팡 광고센터에 로그인한 뒤 수익성 데이터를 다시 갱신해 주세요.',
    };
  }
  if (reason === 'sellpia_login_required') {
    return {
      label: '로그인 필요',
      message: 'Sellpia에 로그인한 뒤 수익성 데이터를 다시 갱신해 주세요.',
    };
  }
  if (reason === 'captcha') {
    return {
      label: '보안문자 확인 필요',
      message: '열린 수집 화면에서 보안문자를 확인한 뒤 다시 갱신해 주세요.',
    };
  }
  return {
    label: STATUS_LABEL.ACTION_REQUIRED,
    message: '열린 수집 화면에서 필요한 조치를 마친 뒤 다시 갱신해 주세요.',
  };
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2"><dt className="text-[11px] font-bold text-[var(--text-tertiary)]">{label}</dt><dd className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatNumber(value)}</dd></div>;
}
