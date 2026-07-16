import { Boxes, CircleDollarSign, Package } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatKRW, formatNumber } from '@/lib/utils';

export default function ProductMetrics({ product }: { product: InventorySkuSnapshotItem }) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded bg-purple-50 px-2.5 py-1 font-mono text-xs font-bold text-purple-700">
          {product.code}
        </span>
        <h1 className="min-w-0 flex-1 text-xl font-bold text-slate-900">{product.name}</h1>
        <span className={`rounded px-2.5 py-1 text-xs font-medium ${product.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {product.isActive ? '활성' : '비활성'}
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-500">{product.optionName || '단일 상품'} · Sellpia 동기화 데이터 · 읽기 전용</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="판매가"
          value={product.salePrice === null ? '-' : `${formatKRW(product.salePrice)}원`}
          icon={<Package size={16} className="text-blue-500" aria-hidden="true" />}
        />
        <MetricCard
          label="매입가"
          value={product.purchasePrice === null ? '-' : `${formatKRW(product.purchasePrice)}원`}
          icon={<CircleDollarSign size={16} className="text-green-500" aria-hidden="true" />}
        />
        <MetricCard
          label="현재 재고"
          value={`${formatNumber(product.currentStock)}개`}
          icon={<Boxes size={16} className="text-amber-500" aria-hidden="true" />}
        />
      </div>
    </section>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
