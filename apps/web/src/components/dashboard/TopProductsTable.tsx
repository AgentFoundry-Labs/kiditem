import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { formatKRW, formatPercent, getGradeColor, getProfitColor, cn } from '@/lib/utils';

interface TopProduct {
  id: string;
  name: string;
  company: string;
  grade: string;
  revenue: number;
  netProfit: number;
  profitRate: number;
}

interface TopProductsTableProps {
  products: TopProduct[];
}

export default function TopProductsTable({ products }: TopProductsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900">Top Revenue Products</h3>
        </div>
        <Link href="/products" className="text-xs text-blue-600 font-medium hover:text-blue-700">
          전체 보기 →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 font-medium w-8">#</th>
              <th className="px-4 py-3 font-medium w-8">등급</th>
              <th className="px-4 py-3 font-medium">상품명</th>
              <th className="px-4 py-3 font-medium text-right">매출</th>
              <th className="px-4 py-3 font-medium text-right">순이익</th>
              <th className="px-4 py-3 font-medium text-right">이익률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product, i) => (
              <tr key={product.id} className="bg-white hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold', getGradeColor(product.grade))}>
                    {product.grade}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 line-clamp-1 max-w-[300px]">{product.name}</p>
                  {product.company && <p className="text-xs text-gray-500">{product.company}</p>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-gray-900 tabular-nums">
                  ₩{formatKRW(product.revenue)}
                </td>
                <td className={cn('px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums', getProfitColor(product.profitRate))}>
                  ₩{formatKRW(product.netProfit)}
                </td>
                <td className={cn('px-4 py-3 whitespace-nowrap text-right font-semibold tabular-nums', getProfitColor(product.profitRate))}>
                  {formatPercent(product.profitRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
