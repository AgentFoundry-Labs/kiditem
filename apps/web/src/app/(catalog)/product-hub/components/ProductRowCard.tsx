'use client';

import Link from 'next/link';
import { ArrowUpRight, Barcode, PackageSearch } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatKRW, formatNumber } from '@/lib/utils';

export function ProductRowCard({ product }: { product: InventorySkuSnapshotItem }) {
  return (
    <article className="grid grid-cols-[minmax(300px,1.5fr)_minmax(140px,.7fr)_120px_120px_100px_64px] items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-6 py-4 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
          <PackageSearch size={22} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[var(--primary-soft)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--primary)]">
              {product.code}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {product.isActive ? '활성' : '비활성'}
            </span>
          </div>
          <Link
            href={`/product-hub/${product.masterProductId}`}
            className="mt-2 block truncate text-[16px] font-extrabold text-[var(--text-primary)] hover:text-[var(--primary)]"
          >
            {product.name}
          </Link>
          <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
            {product.optionName || '단일 상품'}
          </p>
        </div>
      </div>
      <div className="min-w-0 text-xs text-[var(--text-tertiary)]">
        <p className="flex items-center gap-1.5 truncate font-mono text-[var(--text-secondary)]">
          <Barcode size={13} /> {product.barcode || '-'}
        </p>
      </div>
      <Metric label="매입가" value={product.purchasePrice === null ? '-' : `${formatKRW(product.purchasePrice)}원`} />
      <Metric label="판매가" value={product.salePrice === null ? '-' : `${formatKRW(product.salePrice)}원`} />
      <div className="text-right">
        <p className={`text-xl font-black tabular-nums ${product.currentStock > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {formatNumber(product.currentStock)}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">현재 재고</p>
      </div>
      <Link
        href={`/product-hub/${product.masterProductId}`}
        aria-label={`${product.name} 상세`}
        className="flex h-10 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
      >
        <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
