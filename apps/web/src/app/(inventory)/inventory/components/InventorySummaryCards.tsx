import { Package, PackageCheck, PackageX, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';

type CardTone = 'slate' | 'green' | 'orange';

const toneClasses: Record<CardTone, { card: string; label: string; value: string }> = {
  slate: {
    card: 'border-[var(--border)] bg-[var(--surface)]',
    label: 'text-[var(--text-secondary)]',
    value: 'text-[var(--text-primary)]',
  },
  green: {
    card: 'border-green-200 bg-green-50',
    label: 'text-green-600',
    value: 'text-green-700',
  },
  orange: {
    card: 'border-orange-200 bg-orange-50',
    label: 'text-orange-600',
    value: 'text-orange-700',
  },
};

export function InventorySummaryCards({ summary }: { summary: InventorySkuSnapshotSummary }) {
  const cards: {
    label: string;
    value: number;
    tone: CardTone;
    icon: LucideIcon;
    unit?: string;
  }[] = [
    { label: '전체 재고 SKU', value: summary.totalSkus, tone: 'slate', icon: Package },
    { label: '재고 있는 SKU', value: summary.inStockSkus, tone: 'green', icon: PackageCheck },
    { label: '품절 SKU', value: summary.outOfStockSkus, tone: 'orange', icon: PackageX },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map(({ label, value, tone, icon: Icon, unit }) => (
        <div
          key={label}
          data-testid="inventory-summary-card"
          className={`flex items-center gap-3 rounded-xl border p-4 ${toneClasses[tone].card}`}
        >
          <Icon className={`h-5 w-5 ${toneClasses[tone].label}`} aria-hidden="true" />
          <div>
            <div className={`text-sm ${toneClasses[tone].label}`}>{label}</div>
            <div className={`mt-1 text-xl font-bold ${toneClasses[tone].value}`}>
              {formatNumber(value)}{unit ?? '개'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
