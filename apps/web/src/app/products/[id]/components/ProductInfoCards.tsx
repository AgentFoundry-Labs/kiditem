'use client';
import { Package, Box, ExternalLink } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import type { ProductDetail as Product } from "@kiditem/shared";
import { InfoCard, InfoRow } from "./ProductSidebar";
import { categoryNames } from "./ProductMetrics";

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
        <InfoRow label="소싱 플랫폼" value={product.sourcePlatform ?? "-"} />
        {product.sourceUrl && (
          <InfoRow
            label="소싱 URL"
            value={
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:underline flex items-center gap-1"
              >
                링크 <ExternalLink size={12} />
              </a>
            }
          />
        )}
        <InfoRow label="쿠팡 상품 ID" value={product.coupangProductId ?? "-"} />
        <InfoRow label="배송비" value={product.shippingCost ? `₩${formatKRW(product.shippingCost)}` : "-"} />
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
                  <span className="text-red-600 font-semibold">⚠ 필요</span>
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
