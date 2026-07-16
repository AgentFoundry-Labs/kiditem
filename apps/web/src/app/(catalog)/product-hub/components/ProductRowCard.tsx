'use client';

import Link from 'next/link';
import { ArrowUpRight, Barcode, PackageSearch } from 'lucide-react';
import { formatDateTime, formatKRW, formatNumber } from '@/lib/utils';
import { PRODUCT_OPERATIONS_GRID_CLASS } from '../lib/product-list-layout';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

export function ProductRowCard({ product }: { product: InventorySkuSnapshotItem }) {
  const isOutOfStock = product.currentStock <= 0;
  const stockTone = isOutOfStock ? 'text-rose-600' : 'text-[var(--text-primary)]';

  return (
    <article className={`relative min-w-0 overflow-hidden rounded-2xl border px-4 py-4 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md 2xl:px-6 2xl:py-5 ${isOutOfStock ? 'border-amber-200 bg-amber-50/40' : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}>
      {isOutOfStock ? <span className="absolute left-0 top-0 h-full w-1 bg-amber-500" aria-hidden="true" /> : null}
      <div className={PRODUCT_OPERATIONS_GRID_CLASS}>
        <div className="flex min-w-0 items-center gap-3 2xl:gap-5">
          <div className="w-10 shrink-0 text-center 2xl:w-14">
            <p className="text-sm font-semibold text-[var(--text-muted)]">-</p>
            <p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">미집계</p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)] 2xl:h-[88px] 2xl:w-[88px]">
            <PackageSearch size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">미분류</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {product.isActive ? '판매중' : '판매중지'}
              </span>
              {isOutOfStock ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">품절</span>
              ) : null}
            </div>
            <Link
              href={`/product-hub/${product.masterProductId}`}
              className="mt-2 block truncate text-[15px] font-extrabold text-[var(--text-primary)] hover:text-[var(--primary)] 2xl:text-[17px]"
            >
              {product.name}
            </Link>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              Sellpia {product.code} · {product.optionName || '단일 상품'}
            </p>
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-[var(--text-muted)]">
              <Barcode size={11} /> {product.barcode || '바코드 없음'}
            </p>
          </div>
        </div>

        <Metric value={formatNumber(product.currentStock)} label="재고" tone={stockTone} />
        <UnavailableMetric label="방문" />
        <UnavailableMetric label="조회" />
        <UnavailableMetric label="장바구니" />
        <UnavailableMetric label="주문" />
        <UnavailableMetric label="판매" />
        <UnavailableMetric label="매출" detail="손익 미수집" />
        <UnavailableMetric label="광고비율" />
        <div className="flex justify-end">
          <Link
            href={`/product-hub/${product.masterProductId}`}
            aria-label={`${product.name} 상세`}
            className="inline-flex h-9 w-9 items-center justify-center gap-1 rounded-xl bg-[var(--surface-sunken)] text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] 2xl:h-10 2xl:w-auto 2xl:px-3"
          >
            <span className="hidden 2xl:inline">상세</span> <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--text-tertiary)]">
        <span className={`rounded px-2 py-1 font-bold ${isOutOfStock ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {isOutOfStock ? '품절' : 'Sellpia 재고 확인'}
        </span>
        <span>매입가 {product.purchasePrice === null ? '미등록' : `${formatKRW(product.purchasePrice)}원`}</span>
        <span>판매가 {product.salePrice === null ? '미등록' : `${formatKRW(product.salePrice)}원`}</span>
        <span>재고자산 {product.stockValue === null ? '계산 불가' : `${formatKRW(product.stockValue)}원`}</span>
        <span>일평균 계산 전</span>
        <span>리드타임 미설정</span>
        <span>발주점 미설정</span>
        <span>소진예상 계산 전</span>
        <span className="ml-auto">최종 가져오기 {formatDateTime(product.lastImportedAt)}</span>
      </div>
    </article>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="text-right">
      <p className={`text-lg font-black leading-none tabular-nums 2xl:text-[22px] ${tone}`}>{value}</p>
      <p className="mt-2 text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function UnavailableMetric({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="text-right" title={`${label} 데이터는 현재 Sellpia 스냅샷에 포함되지 않습니다.`}>
      <p className="text-lg font-black leading-none text-[var(--text-quaternary)] opacity-50 2xl:text-[22px]">—</p>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{detail ?? label}</p>
    </div>
  );
}
