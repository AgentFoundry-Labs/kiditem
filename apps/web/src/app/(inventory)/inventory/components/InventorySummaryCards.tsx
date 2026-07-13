import { CircleDollarSign, Package, PackageCheck, PackageX, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';

type CardTone = 'slate' | 'green' | 'orange' | 'purple';

const toneClasses: Record<CardTone, { card: string; label: string; value: string }> = {
  slate: {
    card: 'border-slate-200 bg-white',
    label: 'text-slate-500',
    value: 'text-slate-900',
  },
  green: {
    card: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950',
    label: 'text-green-600 dark:text-green-400',
    value: 'text-green-700 dark:text-green-300',
  },
  orange: {
    card: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
    label: 'text-orange-600 dark:text-orange-400',
    value: 'text-orange-700 dark:text-orange-300',
  },
  purple: {
    card: 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950',
    label: 'text-purple-600 dark:text-purple-400',
    value: 'text-purple-700 dark:text-purple-300',
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
    { label: '전체 상품', value: summary.totalSkus, tone: 'slate', icon: Package },
    { label: '재고 있음', value: summary.inStockSkus, tone: 'green', icon: PackageCheck },
    { label: '재고 없음', value: summary.outOfStockSkus, tone: 'orange', icon: PackageX },
    {
      label: '평가 재고자산',
      value: summary.pricedAssetValue,
      tone: 'purple',
      icon: CircleDollarSign,
      unit: '원',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
