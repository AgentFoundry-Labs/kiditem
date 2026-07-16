'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ScanLine,
  Slash,
  Sparkles,
} from 'lucide-react';
import type {
  ChannelSkuMappingListItem,
  ChannelSkuMappingStatus,
} from '@kiditem/shared/channel-sku-matching';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { Pagination } from '@/components/ui/Pagination';
import { cn, formatNumber } from '@/lib/utils';
import { useChannelSkuMappings } from '../hooks/useChannelSkuMappings';

const PAGE_LIMIT = 50;

type LegacyStatus = 'auto_linked' | 'needs_review' | 'conflict' | 'linked' | 'ignored';

const STATUS_TABS: Array<{ key: LegacyStatus; label: string }> = [
  { key: 'auto_linked', label: '자동 연결' },
  { key: 'needs_review', label: '확인 필요' },
  { key: 'conflict', label: '충돌' },
  { key: 'linked', label: '처리 완료' },
  { key: 'ignored', label: '제외' },
];

function currentStatusFor(status: LegacyStatus): ChannelSkuMappingStatus | 'all' {
  if (status === 'needs_review') return 'needs_review';
  if (status === 'linked') return 'matched';
  return 'all';
}

function isUnavailable(status: LegacyStatus): boolean {
  return status === 'auto_linked' || status === 'conflict' || status === 'ignored';
}

export function LegacyMatchingCenter() {
  const [status, setStatus] = useState<LegacyStatus>('needs_review');
  const [page, setPage] = useState(1);
  const mappingsQuery = useChannelSkuMappings({
    accountMode: 'all',
    mappingStatus: currentStatusFor(status),
    page,
    limit: PAGE_LIMIT,
  });

  const counts = useMemo(() => ({
    auto_linked: 0,
    needs_review: mappingsQuery.data?.counts.needsReview ?? 0,
    conflict: 0,
    linked: mappingsQuery.data?.counts.matched ?? 0,
    ignored: 0,
  }), [mappingsQuery.data?.counts]);
  const unavailable = isUnavailable(status);
  const rows = unavailable ? [] : mappingsQuery.data?.items ?? [];
  const total = unavailable ? 0 : mappingsQuery.data?.total ?? 0;

  return (
    <div className="space-y-6 animate-in pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 매칭 센터</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            쿠팡 상품과 KidItem 상품·재고 옵션의 연결 상태를 점검합니다. 기존 매칭 이력 화면은 유지하고, 현재 Sellpia 구성품 연결은 별도 화면에서 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SellpiaWorkspaceFreshnessStatus />
          <button
            type="button"
            onClick={() => mappingsQuery.refetch()}
            disabled={mappingsQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={mappingsQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
            새로고침
          </button>
          <button
            type="button"
            disabled
            aria-describedby="legacy-image-sync-unavailable"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-300 px-3 py-2 text-sm text-white"
          >
            <ScanLine size={14} aria-hidden="true" /> 이미지 동기화 데이터 점검
          </button>
          <Link
            href="/product-hub/matching?view=channel-recipes"
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
          >
            채널 SKU 구성품 관리 <ExternalLink size={13} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <p id="legacy-image-sync-unavailable" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        기존 이미지 동기화 점검 계약은 현재 서버에서 제공되지 않습니다. 버튼과 이력 화면은 보존하며, 현재 연결 작업은 채널 SKU 구성품 관리에서 진행합니다.
      </p>

      <LegacySummaryCards
        counts={counts}
        total={mappingsQuery.data?.counts.all ?? 0}
        loading={mappingsQuery.isLoading}
      />

      <section className="space-y-3" aria-label="기존 상품 매칭 이력">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="기존 매칭 상태">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-purple-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {tab.label}
                <span className={cn(
                  'ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                )}>
                  {formatNumber(counts[tab.key])}
                </span>
              </button>
            );
          })}
        </div>

        {unavailable ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            현재 채널 SKU 데이터는 ‘{STATUS_TABS.find((tab) => tab.key === status)?.label}’ 이력을 별도로 구분하지 않습니다. 기존 탭은 보존하며 0건으로 표시합니다.
          </p>
        ) : null}

        {mappingsQuery.isFetching && !mappingsQuery.isLoading ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin text-purple-600" aria-hidden="true" /> 매칭 목록 갱신 중
          </p>
        ) : null}

        <LegacyMappingTable rows={rows} loading={mappingsQuery.isLoading} />
        <Pagination page={page} limit={PAGE_LIMIT} total={total} onPageChange={setPage} />
      </section>
    </div>
  );
}

function LegacySummaryCards({
  counts,
  total,
  loading,
}: {
  counts: Record<LegacyStatus, number>;
  total: number;
  loading: boolean;
}) {
  const cards = [
    { label: '총 매칭 row', value: total, icon: Sparkles, color: 'text-slate-900' },
    { label: '자동 연결', value: counts.auto_linked, icon: CheckCircle2, color: 'text-green-600' },
    { label: '확인 필요', value: counts.needs_review, icon: AlertTriangle, color: 'text-amber-600' },
    { label: '충돌', value: counts.conflict, icon: AlertCircle, color: 'text-red-600' },
    { label: '제외', value: counts.ignored, icon: Slash, color: 'text-slate-500' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{card.label}</span>
            <card.icon size={16} aria-hidden="true" />
          </div>
          <div className={cn('mt-1 text-2xl font-bold tabular-nums', card.color)}>
            {loading ? '—' : formatNumber(card.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function LegacyMappingTable({ rows, loading }: { rows: ChannelSkuMappingListItem[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {['KidItem 상품', '쿠팡 상품', '판매자 코드', '매칭 사유', '상태', '액션'].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">불러오는 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">현재 탭에 표시할 매칭 row가 없습니다.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.sku.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 align-top text-sm text-slate-900">
                  {row.components.length > 0
                    ? row.components.map((component) => component.optionName ? `${component.name} · ${component.optionName}` : component.name).join(', ')
                    : 'Sellpia 구성품 미연결'}
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="text-sm text-slate-900">{row.product.displayName || row.product.registeredName || '(이름 없음)'}</p>
                  <p className="mt-0.5 text-xs text-slate-400">SKU {row.sku.externalSkuId}</p>
                </td>
                <td className="px-4 py-3 align-top font-mono text-sm text-slate-700">{row.sku.sellerSku || row.sku.modelNumber || '—'}</td>
                <td className="px-4 py-3 align-top text-sm text-slate-500">현재 채널 SKU 상태 기준</td>
                <td className="px-4 py-3 align-top">
                  <span className={cn(
                    'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
                    row.sku.mappingStatus === 'matched'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}>
                    {row.sku.mappingStatus === 'matched' ? '처리 완료' : '확인 필요'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <Link href="/product-hub/matching?view=channel-recipes" className="text-xs font-medium text-purple-600 hover:underline">
                    구성품 확인
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
