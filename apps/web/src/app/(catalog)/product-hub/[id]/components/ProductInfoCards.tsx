import { Box, Package } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatKRW, formatNumber } from '@/lib/utils';
import { InfoCard, InfoRow } from './ProductSidebar';

export default function ProductInfoCards({ product }: { product: InventorySkuSnapshotItem }) {
  return (
    <div className="space-y-6">
      <InfoCard title="상품 정보" icon={<Package size={16} aria-hidden="true" />}>
        <InfoRow label="상품 코드" value={<span className="font-mono">{product.code}</span>} />
        <InfoRow label="상품명" value={product.name} />
        <InfoRow label="옵션명" value={product.optionName || '-'} />
        <InfoRow label="바코드" value={<span className="font-mono">{product.barcode || '-'}</span>} />
        <InfoRow label="MasterProduct ID" value={<span className="font-mono text-xs">{product.masterProductId}</span>} />
      </InfoCard>

      <InfoCard title="재고 현황" icon={<Box size={16} aria-hidden="true" />}>
        <InfoRow
          label="현재 재고"
          value={<strong className={product.currentStock > 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatNumber(product.currentStock)}개</strong>}
        />
        <InfoRow label="매입가" value={product.purchasePrice === null ? '-' : `${formatKRW(product.purchasePrice)}원`} />
        <InfoRow label="판매가" value={product.salePrice === null ? '-' : `${formatKRW(product.salePrice)}원`} />
        <InfoRow label="재고 자산가" value={product.stockValue === null ? '-' : `${formatKRW(product.stockValue)}원`} />
      </InfoCard>
    </div>
  );
}
