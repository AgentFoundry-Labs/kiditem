'use client';

import {
  TrendingUp, TrendingDown,
  ExternalLink,
} from 'lucide-react';
import { formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
import type { AdsListItem as AdProduct } from '@kiditem/shared';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

const GRADE_TARGETS: Record<string, number> = { A: 80, B: 15, C: 5 };
const GRADE_LABELS: Record<string, string> = { A: '핵심상품', B: '성장상품', C: '정리대상' };

function getStatusBadge(p: AdProduct): { label: string; cls: string } {
  if (p.profitRate < 0) return { label: '적자', cls: 'bg-red-100 text-red-700' };
  if (p.adRate > 15) return { label: '점검필요', cls: 'bg-orange-100 text-orange-700' };
  if (p.roas > 0 && p.roas < 200) return { label: '효율낮음', cls: 'bg-yellow-100 text-yellow-700' };
  return { label: '정상', cls: 'bg-green-100 text-green-700' };
}

export function AdsOverviewTab({
  adData,
  activeGrade,
  setActiveGrade,
  gradeProducts,
  gradeStats,
  gradeRoas,
  gradeProfitRate,
  monthlyTrendData,
  changeTier,
  tierUpdating,
}: {
  adData: { summary: { gradeSpendPercent: Record<string, number> } } | null;
  activeGrade: 'A' | 'B' | 'C';
  setActiveGrade: (g: 'A' | 'B' | 'C') => void;
  gradeProducts: AdProduct[];
  gradeStats: Record<string, { count: number; revenue: number; spend: number }>;
  gradeRoas: Record<string, number>;
  gradeProfitRate: Record<string, number>;
  monthlyTrendData: { period: string; adCost: number }[];
  changeTier: (productId: string, newTier: string) => void;
  tierUpdating: string | null;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map((g) => {
          const s = gradeStats[g];
          const spendPct = adData?.summary.gradeSpendPercent[g] ?? 0;
          const target = GRADE_TARGETS[g];
          const isOnTarget = Math.abs(spendPct - target) <= 10;
          return (
            <button
              key={g}
              onClick={() => setActiveGrade(g)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                activeGrade === g
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(g)}`}>
                  {g}등급
                </span>
                <span className="text-[10px] text-gray-400">{GRADE_LABELS[g]}</span>
              </div>
              <div className="text-lg font-bold">{s.count}개</div>
              <div className="text-xs text-gray-500 mt-1">매출 ₩{formatKRW(s.revenue)}</div>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-400">광고 예산 배분</span>
                  <span className={isOnTarget ? 'text-green-600' : 'text-orange-500'}>
                    {spendPct}% / 목표 {target}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all ${
                      g === 'A' ? 'bg-green-400' : g === 'B' ? 'bg-yellow-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(spendPct, 100)}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-0.5 bg-gray-800"
                    style={{ left: `${target}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(activeGrade)}`}>
              {activeGrade}등급
            </span>
            <span className="text-sm font-medium">{GRADE_LABELS[activeGrade]} 광고 현황</span>
            <span className="text-xs text-gray-400">{gradeProducts.length}개 상품</span>
          </div>
          <a href="/ads" className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
            전체보기 <ExternalLink size={10} />
          </a>
        </div>

        {gradeProducts.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">해당 등급의 광고 상품이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/50 text-gray-500">
                  <th className="text-left px-4 py-2 font-medium">상품명</th>
                  <th className="text-right px-3 py-2 font-medium">매출</th>
                  <th className="text-right px-3 py-2 font-medium">이익률</th>
                  <th className="text-right px-3 py-2 font-medium">광고비</th>
                  <th className="text-right px-3 py-2 font-medium">ROAS</th>
                  <th className="text-center px-3 py-2 font-medium">상태</th>
                  <th className="text-center px-3 py-2 font-medium">티어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gradeProducts.slice(0, 20).map((p) => {
                  const status = getStatusBadge(p);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="max-w-[200px] truncate font-medium text-gray-900">{p.name}</div>
                        <div className="text-[10px] text-gray-400">
                          {p.company} · {p.adTier || '미설정'}
                        </div>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">₩{formatKRW(p.revenue)}</td>
                      <td className={`text-right px-3 py-2.5 tabular-nums ${getProfitColor(p.profitRate)}`}>
                        {formatPercent(p.profitRate)}
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">₩{formatKRW(p.spend)}</td>
                      <td
                        className={`text-right px-3 py-2.5 tabular-nums font-medium ${
                          p.roas >= 300 ? 'text-green-600' : p.roas >= 200 ? 'text-orange-500' : 'text-red-500'
                        }`}
                      >
                        {p.roas}%
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <select
                          value={p.adTier || 'OFF'}
                          onChange={(e) => changeTier(p.id, e.target.value)}
                          disabled={tierUpdating === p.id}
                          className={`text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-white cursor-pointer focus:ring-1 focus:ring-blue-400 ${
                            tierUpdating === p.id ? 'opacity-50' : ''
                          }`}
                        >
                          <option value="1차">1차</option>
                          <option value="2차">2차</option>
                          <option value="3차">3차</option>
                          <option value="OFF">OFF</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs text-gray-400 mb-3">등급별 ROAS</div>
          <div className="space-y-2">
            {(['A', 'B', 'C'] as const).map((g) => (
              <div key={g} className="flex items-center gap-2">
                <span className={`w-5 text-center text-[10px] font-bold rounded ${getGradeColor(g)}`}>
                  {g}
                </span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      gradeRoas[g] >= 300
                        ? 'bg-green-400'
                        : gradeRoas[g] >= 200
                          ? 'bg-yellow-400'
                          : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(gradeRoas[g] / 5, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono w-12 text-right">{gradeRoas[g]}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs text-gray-400 mb-2">월간 광고비 추이</div>
          {monthlyTrendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={monthlyTrendData}>
                <XAxis dataKey="period" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}
                  formatter={(v: unknown) => [`₩${formatKRW(Number(v))}`, '광고비']}
                />
                <Area
                  type="monotone"
                  dataKey="adCost"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-xs text-gray-300">
              데이터 부족
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs text-gray-400 mb-3">등급별 이익률</div>
          <div className="space-y-2">
            {(['A', 'B', 'C'] as const).map((g) => (
              <div key={g} className="flex items-center gap-2">
                <span className={`w-5 text-center text-[10px] font-bold rounded ${getGradeColor(g)}`}>
                  {g}
                </span>
                <div className="flex-1">
                  <div className={`text-sm font-bold tabular-nums ${getProfitColor(gradeProfitRate[g])}`}>
                    {gradeProfitRate[g]}%
                  </div>
                </div>
                {gradeProfitRate[g] > 0 ? (
                  <TrendingUp size={12} className="text-green-500" />
                ) : (
                  <TrendingDown size={12} className="text-red-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
