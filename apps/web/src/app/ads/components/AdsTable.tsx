'use client';
import type { AdsListItem as AdProduct } from '@kiditem/shared';
import { formatKRW, formatPercent, getGradeColor } from '@/lib/utils';

interface Props {
  filtered: AdProduct[];
}

export function AdsTable({ filtered }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-slate-50">
              <th>등급</th>
              <th>광고</th>
              <th>상품명</th>
              <th className="text-right">광고비</th>
              <th className="text-right">광고매출</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">CTR</th>
              <th className="text-right">전환율</th>
              <th className="text-right">광고비율</th>
              <th className="text-right">순이익률</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center py-12 text-slate-500">광고 데이터가 없습니다.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className={p.adRate > 15 ? "bg-red-50/50" : ""}>
                <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(p.grade)}`}>{p.grade}</span></td>
                <td><span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">{p.adTier}</span></td>
                <td className="font-medium text-slate-900">{p.name}</td>
                <td className="text-right">{formatKRW(p.spend)}</td>
                <td className="text-right">{formatKRW(p.adRevenue)}</td>
                <td className={`text-right font-semibold ${p.roas >= 300 ? "text-green-600" : p.roas >= 200 ? "text-orange-500" : "text-red-600"}`}>{p.roas}%</td>
                <td className="text-right">{p.ctr}%</td>
                <td className="text-right">{p.convRate}%</td>
                <td className={`text-right font-semibold ${p.adRate > 15 ? "text-red-600" : "text-slate-600"}`}>{formatPercent(p.adRate)}</td>
                <td className={`text-right ${p.profitRate < 0 ? "text-red-600 font-bold" : p.profitRate <= 3 ? "text-orange-500" : "text-green-600"}`}>{formatPercent(p.profitRate)}</td>
                <td>
                  {p.adRate > 15 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">점검필요</span>}
                  {p.roas < 200 && p.adRate <= 15 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">효율낮음</span>}
                  {p.adRate <= 15 && p.roas >= 200 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">정상</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
