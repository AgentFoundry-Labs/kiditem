'use client';
import { Package, Box } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { InfoCard, InfoRow } from "./ProductSidebar";
import { categoryNames } from "./ProductMetrics";
import type { ProductCatalogDetail as Product } from "@kiditem/shared/product";

export interface InventoryData {
  currentStock: number;
  reservedStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailySalesAvg: number;
  leadTimeDays: number | null;
}

interface ProductInfoCardsProps {
  product: Product;
  inventory: InventoryData | null;
}

export default function ProductInfoCards({ product, inventory }: ProductInfoCardsProps) {
  const daysOfStock =
    inventory && inventory.dailySalesAvg > 0
      ? Math.floor(inventory.currentStock / inventory.dailySalesAvg)
      : null;
  const needsReorder = inventory && inventory.currentStock <= inventory.reorderPoint;

  return (
    <>
      <InfoCard title="상품 정보" icon={<Package size={16} />}>
        <InfoRow label="카테고리" value={categoryNames[product.category || ""] || product.category || "-"} />
        <InfoRow label="브랜드" value={product.brand ?? "-"} />
        <InfoRow label="상품 코드" value={product.code} />
        {/* Source barcode/EAN from kiditem_list. Distinct from
            option-level SKU/barcode below. May be shared across multiple
            masters (search returns a list). */}
        <InfoRow
          label="EAN / 자사상품코드"
          value={product.barcode ? <span className="font-mono">{product.barcode}</span> : "-"}
        />
        <InfoRow label="대표 SKU" value={product.representativeSku ?? "-"} />
        <InfoRow label="옵션 수" value={`${product.optionCount}개`} />
        {product.options.length > 0 && (
          <>
            <div className="border-t border-slate-100 my-2" />
            {product.options.map((option) => (
              <div key={option.id} className="rounded-lg border border-slate-100 p-2 space-y-1">
                <InfoRow label="옵션명" value={option.optionName ?? "-"} />
                <InfoRow label="SKU" value={<span className="font-mono">{option.sku}</span>} />
                <InfoRow
                  label="판매자 상품코드"
                  value={option.legacyCode ? <span className="font-mono">{option.legacyCode}</span> : "-"}
                />
                <InfoRow
                  label="옵션 바코드"
                  value={option.barcode ? <span className="font-mono">{option.barcode}</span> : "-"}
                />
                <InfoRow label="매입가" value={option.costPrice ? `₩${formatKRW(option.costPrice)}` : "-"} />
                <InfoRow label="판매가" value={option.sellPrice ? `₩${formatKRW(option.sellPrice)}` : "-"} />
                {option.commissionRate != null && (
                  <InfoRow label="수수료율" value={`${(Number(option.commissionRate) * 100).toFixed(1)}%`} />
                )}
              </div>
            ))}
          </>
        )}
        <div className="border-t border-slate-100 my-2" />
        <InfoRow label="총 가용 재고" value={`${product.totalAvailableStock}개`} />
      </InfoCard>

      {inventory ? (
        <InfoCard title="재고 현황" icon={<Box size={16} />}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <InfoRow label="현재 재고" value={`${inventory.currentStock ?? 0}개`} />
            <InfoRow label="안전 재고" value={`${inventory.safetyStock ?? 0}개`} />
            <InfoRow label="일평균 판매" value={`${(inventory.dailySalesAvg ?? 0).toFixed(1)}개`} />
            <InfoRow label="발주점" value={`${inventory.reorderPoint ?? 0}개`} />
            <InfoRow label="남은 일수" value={daysOfStock != null ? `${daysOfStock}일` : "-"} />
            <InfoRow
              label="발주 필요"
              value={
                needsReorder ? (
                  <span className="text-red-600 font-semibold">필요</span>
                ) : (
                  <span className="text-green-600">충분</span>
                )
              }
            />
          </div>
        </InfoCard>
      ) : (
        <InfoCard title="재고 현황" icon={<Box size={16} />}>
          <p className="text-sm text-slate-400">재고 데이터 없음</p>
        </InfoCard>
      )}
    </>
  );
}
