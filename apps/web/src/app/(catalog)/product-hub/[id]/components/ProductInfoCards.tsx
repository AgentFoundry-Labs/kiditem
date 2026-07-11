'use client';

import { Package } from 'lucide-react';
import type { ProductCatalogDetail as Product } from '@kiditem/shared/product';
import { formatKRW } from '@/lib/utils';
import { categoryNames } from './ProductMetrics';
import { InfoCard, InfoRow } from './ProductSidebar';
import { ChannelSkuInventorySummary } from '../../components/ChannelSkuInventorySummary';

interface ProductInfoCardsProps {
  product: Product;
}

export default function ProductInfoCards({ product }: ProductInfoCardsProps) {
  return (
    <div className="space-y-4">
      <InfoCard title="상품 정보" icon={<Package size={16} />}>
        <InfoRow label="카테고리" value={categoryNames[product.category || ''] || product.category || '-'} />
        <InfoRow label="브랜드" value={product.brand ?? '-'} />
        <InfoRow label="상품 코드" value={product.code} />
        <InfoRow
          label="EAN / 자사상품코드"
          value={product.barcode ? <span className="font-mono">{product.barcode}</span> : '-'}
        />
        <InfoRow label="대표 SKU" value={product.representativeSku ?? '-'} />
        <InfoRow label="옵션 수" value={`${product.optionCount}개`} />
        {product.options.length > 0 ? (
          <>
            <div className="my-2 border-t border-slate-100" />
            {product.options.map((option) => (
              <div key={option.id} className="space-y-1 rounded-lg border border-slate-100 p-2">
                <InfoRow label="옵션명" value={option.optionName ?? '-'} />
                <InfoRow label="SKU" value={<span className="font-mono">{option.sku}</span>} />
                <InfoRow
                  label="판매자 상품코드"
                  value={option.legacyCode ? <span className="font-mono">{option.legacyCode}</span> : '-'}
                />
                <InfoRow
                  label="옵션 바코드"
                  value={option.barcode ? <span className="font-mono">{option.barcode}</span> : '-'}
                />
                <InfoRow label="매입가" value={option.costPrice ? `₩${formatKRW(option.costPrice)}` : '-'} />
                <InfoRow label="판매가" value={option.sellPrice ? `₩${formatKRW(option.sellPrice)}` : '-'} />
                {option.commissionRate != null ? (
                  <InfoRow label="수수료율" value={`${(Number(option.commissionRate) * 100).toFixed(1)}%`} />
                ) : null}
              </div>
            ))}
          </>
        ) : null}
      </InfoCard>
      <ChannelSkuInventorySummary />
    </div>
  );
}
