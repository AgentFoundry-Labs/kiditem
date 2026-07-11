import { Boxes, CircleDollarSign, PackageCheck, PackageX, Tags, Warehouse, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';

const cards: { key: keyof InventorySkuSnapshotSummary; label: string; icon: LucideIcon; unit?: string }[] = [
  { key: 'totalSkus', label: '전체 SKU', icon: Boxes },
  { key: 'inStockSkus', label: '재고 있음', icon: PackageCheck },
  { key: 'outOfStockSkus', label: '재고 0', icon: PackageX },
  { key: 'totalUnits', label: '총 수량', icon: Warehouse },
  { key: 'pricedAssetValue', label: '평가 재고자산', icon: CircleDollarSign, unit: '원' },
  { key: 'unpricedSkuCount', label: '가격 미등록', icon: Tags },
];

export function InventorySummaryCards({ summary }: { summary: InventorySkuSnapshotSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map(({ key, label, icon: Icon, unit }) => (
        <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </div>
          <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
            {formatNumber(summary[key])}{unit ?? '개'}
          </p>
        </div>
      ))}
    </div>
  );
}
