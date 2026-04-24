'use client';

import { Package, TrendingUp, BarChart3, Star } from 'lucide-react';
import {
  cn,
  formatKRW,
  formatPercent,
  getGradeColor,
  getProfitColor,
  getProductStatusBadge,
} from '@/lib/utils';
import type { ProductCatalogDetail as Product } from '@kiditem/shared';

const categoryNames: Record<string, string> = {
  '4944': '완구 > 퍼즐',
  '4943': '완구 > 블록/레고',
  '4937': '완구 > 인형/피규어',
  '4938': '완구 > 교육완구',
  '4939': '완구 > 물놀이/목욕',
  '4940': '완구 > 자동차/RC',
  '4941': '완구 > 보드게임',
  '4942': '완구 > 미술/공예',
  '4946': '완구 > 악기',
  '4945': '완구 > 과학/탐구',
  '4947': '완구 > 스포츠/야외',
  '65799': '문구/사무 > 학용품',
  '65800': '문구/사무 > 필기구',
};

interface ProductMetricsProps {
  product: Product;
}

function MetricCard({
  label,
  value,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold', valueColor || 'text-slate-900')}>
        {value}
      </p>
    </div>
  );
}

export default function ProductMetrics({ product }: ProductMetricsProps) {
  const badge = getProductStatusBadge(product.pipelineStep ?? 'draft');

  const representativeOption = product.options[0] ?? null;
  const sellPrice = representativeOption?.sellPrice ?? product.priceRange?.min ?? null;
  const costPrice = representativeOption?.costPrice ?? product.costRange?.min ?? null;
  const marginRate =
    sellPrice && sellPrice > 0 && costPrice && costPrice > 0
      ? (sellPrice - costPrice) / sellPrice
      : null;
  const commissionRate = representativeOption?.commissionRate ?? null;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        {product.abcGrade && (
          <span
            className={cn('px-2.5 py-1 rounded text-sm font-bold', getGradeColor(product.abcGrade))}
          >
            {product.abcGrade}
          </span>
        )}
        <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
        <span className={cn('ml-auto px-2.5 py-1 rounded text-xs font-medium', badge.color)}>
          {badge.label}
        </span>
      </div>

      {sellPrice == null && costPrice == null && commissionRate == null && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-amber-700">
          옵션을 등록하면 가격 지표가 표시됩니다.
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="판매가"
          value={sellPrice ? `${formatKRW(sellPrice)}원` : "-"}
          icon={<Package size={16} className="text-blue-500" />}
        />
        <MetricCard
          label="매입가"
          value={costPrice ? `${formatKRW(costPrice)}원` : "-"}
          icon={<TrendingUp size={16} className="text-green-500" />}
        />
        <MetricCard
          label="이익률"
          value={marginRate != null ? formatPercent(marginRate * 100) : "-"}
          icon={<BarChart3 size={16} className="text-purple-500" />}
          valueColor={marginRate != null ? getProfitColor(marginRate * 100) : ""}
        />
        <MetricCard
          label="수수료율"
          value={commissionRate != null ? formatPercent(Number(commissionRate) * 100) : "-"}
          icon={<Star size={16} className="text-amber-500" />}
        />
      </div>
    </div>
  );
}

export { categoryNames };
