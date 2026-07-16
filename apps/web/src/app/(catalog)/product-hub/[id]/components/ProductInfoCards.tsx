import { Barcode, Boxes, CircleDollarSign, History } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatDateTime, formatKRW, formatNumber } from '@/lib/utils';

export default function ProductInfoCards({ product }: { product: InventorySkuSnapshotItem }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard title="Sellpia 상품 식별자" icon={<Barcode size={16} />}>
        <InfoRow label="상품 코드" value={<span className="font-mono">{product.code}</span>} />
        <InfoRow label="상품명" value={product.name} />
        <InfoRow label="옵션명" value={product.optionName || '-'} />
        <InfoRow label="바코드" value={<span className="font-mono">{product.barcode || '-'}</span>} />
        <InfoRow label="MasterProduct ID" value={<span className="font-mono text-xs">{product.masterProductId}</span>} />
      </InfoCard>

      <InfoCard title="현재 재고" icon={<Boxes size={16} />}>
        <InfoRow
          label="재고 수량"
          value={<strong className={product.currentStock > 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatNumber(product.currentStock)}개</strong>}
        />
        <InfoRow label="활성 상태" value={product.isActive ? '활성' : '비활성'} />
        <InfoRow label="재고 자산가" value={product.stockValue === null ? '-' : `${formatKRW(product.stockValue)}원`} />
      </InfoCard>

      <InfoCard title="가격" icon={<CircleDollarSign size={16} />}>
        <InfoRow label="매입가" value={product.purchasePrice === null ? '-' : `${formatKRW(product.purchasePrice)}원`} />
        <InfoRow label="판매가" value={product.salePrice === null ? '-' : `${formatKRW(product.salePrice)}원`} />
      </InfoCard>

      <InfoCard title="동기화 출처" icon={<History size={16} />}>
        <InfoRow label="마지막 가져오기" value={formatDateTime(product.lastImportedAt)} />
        <InfoRow label="Import Run ID" value={<span className="font-mono text-xs">{product.lastImportRunId || '-'}</span>} />
        <p className="pt-2 text-xs leading-5 text-[var(--text-tertiary)]">
          이 화면에서는 재고와 상품 정보를 수정하지 않습니다. 다음 Sellpia 엑셀 가져오기 결과가 그대로 반영됩니다.
        </p>
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span> {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-[var(--text-tertiary)]">{label}</dt>
      <dd className="min-w-0 break-all text-right font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
