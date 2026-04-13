'use client';

import { ExternalLink } from 'lucide-react';
import {
  cn,
  formatKRW,
  formatPercent,
  getGradeColor,
  getProductStatusBadge,
} from '@/lib/utils';
import type { ProductDetail as Product } from '@kiditem/shared';

interface ProductSidebarProps {
  product: Product;
}

export function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-slate-500">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}

export default function ProductSidebar({ product }: ProductSidebarProps) {
  const badge = getProductStatusBadge(product.status);

  return (
    <div className="w-72 flex-shrink-0 space-y-6">
      <InfoCard title="속성">
        <InfoRow label="상태" value={<span className={cn('px-2 py-0.5 rounded text-xs font-medium', badge.color)}>{badge.label}</span>} />
        <InfoRow label="ABC등급" value={product.abcGrade ? <span className={cn('px-2 py-0.5 rounded text-xs font-bold', getGradeColor(product.abcGrade))}>{product.abcGrade}</span> : "-"} />
        <InfoRow label="광고 티어" value={product.adTier ?? "-"} />
        <InfoRow label="수수료율" value={product.commissionRate != null ? formatPercent(Number(product.commissionRate) * 100) : "-"} />
        <InfoRow label="배송비" value={product.shippingCost ? `₩${formatKRW(product.shippingCost)}` : "-"} />
      </InfoCard>

      <InfoCard title="링크">
        {product.sourceUrl && (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline py-1">
            <ExternalLink size={13} /> 소싱 URL
          </a>
        )}
        {product.detailPageUrl && (
          <a href={product.detailPageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline py-1">
            <ExternalLink size={13} /> 상세페이지
          </a>
        )}
        {product.coupangProductId && (
          <a href={`https://www.coupang.com/vp/products/${product.coupangProductId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline py-1">
            <ExternalLink size={13} /> 쿠팡 리스팅
          </a>
        )}
        {!product.sourceUrl && !product.detailPageUrl && !product.coupangProductId && (
          <p className="text-sm text-slate-400">등록된 링크 없음</p>
        )}
      </InfoCard>
    </div>
  );
}
