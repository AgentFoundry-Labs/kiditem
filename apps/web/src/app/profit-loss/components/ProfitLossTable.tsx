'use client';

import { formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
import type { PLData } from '@kiditem/shared';

interface Props {
  data: PLData[];
  filtered: PLData[];
  filter: string;
  onFilter: (f: string) => void;
}

export default function ProfitLossTable({ data, filtered, filter, onFilter }: Props) {
  return (
    <>
      <div className="flex gap-2">
        {[
          { key: "all", label: `전체 (${data.length})` },
          { key: "minus", label: `적자 (${data.filter(d => d.profitRate < 0).length})`, color: "text-red-600" },
          { key: "low", label: `3%이하 (${data.filter(d => d.profitRate >= 0 && d.profitRate <= 3).length})`, color: "text-orange-600" },
          { key: "normal", label: `정상 (${data.filter(d => d.profitRate > 3).length})`, color: "text-green-600" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600 text-white" : `bg-white border border-slate-200 hover:bg-slate-50 ${f.color || "text-slate-700"}`}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="bg-slate-50">
                <th>등급</th>
                <th>상품명</th>
                <th>회사</th>
                <th className="text-right">매출</th>
                <th className="text-right">매입원가</th>
                <th className="text-right">수수료</th>
                <th className="text-right">배송비</th>
                <th className="text-right">광고비</th>
                <th className="text-right">순이익</th>
                <th className="text-right">이익률</th>
                <th className="text-right">주문수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className={d.profitRate < 0 ? "bg-red-50/50" : d.profitRate <= 3 ? "bg-orange-50/30" : ""}>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(d.grade)}`}>{d.grade}</span></td>
                  <td className="font-medium text-slate-900">{d.productName}</td>
                  <td className="text-slate-500 text-xs">{d.company}</td>
                  <td className="text-right">{formatKRW(d.revenue)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.costOfGoods)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.commission)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.shippingCost)}</td>
                  <td className="text-right text-orange-600">{formatKRW(d.adCost)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(d.profitRate)}`}>{formatKRW(d.netProfit)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(d.profitRate)}`}>{formatPercent(d.profitRate)}</td>
                  <td className="text-right text-slate-600">{d.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
