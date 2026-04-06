'use client';
import { formatKRW } from '@/lib/utils';

interface RankingRow {
  sellerProductId: string;
  sellerProductName: string;
  revenue: number;
  orderCount: number;
}

interface Props {
  ranking: RankingRow[];
  loading: boolean;
}

export default function OrderRankingTable({ ranking, loading }: Props) {
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="text-base font-semibold text-slate-900">상품별 매출 순위 (Top 20)</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
            <th className="px-6 py-3 font-medium">#</th>
            <th className="px-6 py-3 font-medium">상품명</th>
            <th className="px-6 py-3 font-medium text-right">매출</th>
            <th className="px-6 py-3 font-medium text-right">주문 수</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((row, i) => (
            <tr key={row.sellerProductId} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-6 py-3 text-sm text-slate-500">{i + 1}</td>
              <td className="px-6 py-3 text-sm text-slate-900 max-w-[300px] truncate">
                {row.sellerProductName}
              </td>
              <td className="px-6 py-3 text-sm text-slate-900 text-right font-medium">
                ₩{formatKRW(row.revenue)}
              </td>
              <td className="px-6 py-3 text-sm text-slate-500 text-right">{row.orderCount}건</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ranking.length === 0 && !loading && (
        <div className="px-6 py-12 text-center text-sm text-slate-400">데이터가 없습니다</div>
      )}
    </div>
  );
}
