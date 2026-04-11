'use client';

import { Package, TrendingUp, BarChart3, Star } from 'lucide-react';
import {
  formatKRW,
  formatPercent,
  getGradeColor,
  getProfitColor,
  getProductStatusBadge,
} from '@/lib/utils';
import type { ProductDetail as Product } from '@kiditem/shared';

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
      <p className={`text-lg font-semibold ${valueColor || "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ProductMetrics({ product }: ProductMetricsProps) {
  const badge = getProductStatusBadge(product.status);

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        {product.abcGrade && (
          <span
            className={`px-2.5 py-1 rounded text-sm font-bold ${getGradeColor(product.abcGrade)}`}
          >
            {product.abcGrade}
          </span>
        )}
        <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
        <span className={`ml-auto px-2.5 py-1 rounded text-xs font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {product.sellPrice == null && product.costPrice == null && product.marginRate == null && product.commissionRate == null && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-amber-700">
          쿠팡 동기화를 실행하면 판매 데이터가 표시됩니다{" "}
          <a href="/settings" className="underline font-medium">설정으로 이동</a>
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="판매가"
          value={product.sellPrice ? `${formatKRW(product.sellPrice)}원` : "-"}
          icon={<Package size={16} className="text-blue-500" />}
        />
        <MetricCard
          label="매입가"
          value={product.costPrice ? `${formatKRW(product.costPrice)}원` : "-"}
          icon={<TrendingUp size={16} className="text-green-500" />}
        />
        <MetricCard
          label="이익률"
          value={
            product.marginRate != null
              ? formatPercent(Number(product.marginRate) * 100)
              : "-"
          }
          icon={<BarChart3 size={16} className="text-purple-500" />}
          valueColor={
            product.marginRate != null
              ? getProfitColor(Number(product.marginRate) * 100)
              : ""
          }
        />
        <MetricCard
          label="수수료율"
          value={
            product.commissionRate != null
              ? formatPercent(Number(product.commissionRate) * 100)
              : "-"
          }
          icon={<Star size={16} className="text-amber-500" />}
        />
      </div>
    </div>
  );
}

export { categoryNames };
