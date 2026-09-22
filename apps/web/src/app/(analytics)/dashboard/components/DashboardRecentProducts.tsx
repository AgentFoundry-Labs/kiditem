import Link from 'next/link';
import { PackagePlus } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { DashboardCardHeader, DashboardHeaderLink } from './DashboardCardHeader';
import { DashboardProductThumb } from './DashboardProductThumb';
import type { MallListingMatrixRow } from '@kiditem/shared/mall-publishing';

/**
 * 상품별 쇼핑몰 연결 현황 — Channels 가 읽은 원천 상품과 그 상품이 몇 개 몰에 연결됐는지.
 *
 * 줄은 Channels 의 상품×몰 매트릭스 읽기가 세운 순서 그대로다. 현재 공개 계약은 실제 연결
 * 시각을 제공하지 않으므로 이 영역은 최근 연결로 과장하지 않고 현황 목록이라고 부른다.
 * 몰 수는 매트릭스가 published 상태로 센 연결 수이고, 0 이면 어느 몰에도 연결되지 않은 상품이다.
 *
 * Top 상품과 같은 까닭으로 줄 자리가 늘 여섯이다 — 비어 있어도 칸 높이가 움직이지 않는다.
 */
export const RECENT_PRODUCT_SLOTS = 6;

function MallStatus({ publishedCount }: { publishedCount: number }) {
  return publishedCount > 0 ? (
    <span className="inline-flex flex-none items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-100">
      {formatNumber(publishedCount)}개 몰 등록됨
    </span>
  ) : (
    <span className="inline-flex flex-none items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
      몰 연결 없음
    </span>
  );
}

export function DashboardRecentProducts({
  rows,
  isLoading,
  isError,
  className,
}: {
  rows: readonly MallListingMatrixRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}) {
  const visible = (rows ?? []).slice(0, RECENT_PRODUCT_SLOTS);
  const blanks = Math.max(0, RECENT_PRODUCT_SLOTS - visible.length);

  return (
    <section
      aria-label="상품별 쇼핑몰 연결 현황"
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}
      data-testid="dashboard-recent-products"
    >
      <DashboardCardHeader
        icon={PackagePlus}
        tone="emerald"
        title="상품별 쇼핑몰 연결 현황"
        meta={<span className="truncate text-xs font-normal text-slate-400">Channels 상품×몰 매트릭스</span>}
      >
        <DashboardHeaderLink href="/mall-listings">몰 등록 현황</DashboardHeaderLink>
      </DashboardCardHeader>

      {isError ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-red-600">상품별 쇼핑몰 연결 현황을 읽지 못했습니다.</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100" aria-busy={isLoading || undefined}>
          {visible.map((row) => (
            <li key={row.masterProductId}>
              <Link
                href={`/product-hub/${row.masterProductId}`}
                className="flex h-[3.25rem] items-center gap-3 px-4 transition-colors hover:bg-slate-50"
              >
                <DashboardProductThumb imageUrl={row.imageUrl} name={row.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900" title={row.name}>{row.name}</span>
                  <span className="mt-0.5 block truncate text-[13px] tabular-nums text-slate-400">
                    {row.code}
                    {row.stock !== null ? ` · 재고 ${formatNumber(row.stock)}개` : ''}
                  </span>
                </span>
                <MallStatus publishedCount={row.publishedCount} />
              </Link>
            </li>
          ))}
          {Array.from({ length: blanks }, (_, index) => (
            <li key={`slot-${index}`} className="flex h-[3.25rem] items-center gap-3 px-4" aria-hidden="true">
              <span className="h-10 w-10 flex-none rounded-md bg-slate-50" />
              <span className="text-sm text-slate-300">{isLoading && index === 0 ? '불러오는 중' : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
