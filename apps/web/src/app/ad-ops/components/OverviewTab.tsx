'use client';

import {
  AlertTriangle,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatKRW } from '@/lib/utils';
import type { AdTrendsData, AdRulesData, AdWeeklyPlan } from '@kiditem/shared';
import { AdActionPanel } from './AdActionPanel';

interface Props {
  trends: AdTrendsData | undefined;
  wingKpis: Record<string, string>;
  rules: AdRulesData['recommendations'];
  strategy: AdWeeklyPlan | undefined;
}

export function OverviewTab({ trends, wingKpis, rules, strategy }: Props) {
  return (
    <div className="space-y-5">
      {/* Chart + AI Panel (3:1 grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left 3 columns: Combined chart */}
        {trends?.daily?.length ? (
          <div className="lg:col-span-3 rounded-xl border border-slate-100 p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-slate-900">광고비 · 전환매출 · ROAS 추이</h3>
              <div className="flex items-center gap-5 text-[12px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" />광고비</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />전환매출</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-600 inline-block rounded" />ROAS</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" style={{ borderTop: '1px dashed' }} />손익분기</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={440}>
              <ComposedChart data={trends.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="won" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}만` : v >= 1000 ? `${Math.round(v / 1000)}천` : String(v)} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(value: any, name: any) => {
                  if (name === 'roas') return [`${value}%`, 'ROAS'];
                  if (name === 'breakeven') return [`300%`, '손익분기'];
                  return [`${formatKRW(Number(value))}원`, name === 'spend' ? '광고비' : '전환매출'];
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                }} labelFormatter={(label: any) => `${label}일`} />
                <Bar yAxisId="won" dataKey="spend" fill="#93c5fd" radius={[3, 3, 0, 0]} name="spend" barSize={12} />
                <Bar yAxisId="won" dataKey="revenue" fill="#6ee7b7" radius={[3, 3, 0, 0]} name="revenue" barSize={12} />
                <Line yAxisId="pct" type="monotone" dataKey="roas" stroke="#7c3aed" strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 3, strokeWidth: 0 }} name="roas" />
                <Line yAxisId="pct" type="monotone" dataKey={() => 300} stroke="#ef4444" strokeWidth={1} strokeDasharray="6 4" dot={false} name="breakeven" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="lg:col-span-3 rounded-xl border border-slate-100 p-6 flex items-center justify-center bg-white" style={{ minHeight: 200 }}>
            <span className="text-[14px] text-slate-400">차트 데이터 수집 중...</span>
          </div>
        )}

        {/* Right 1 column: Action panel */}
        <AdActionPanel rules={rules} strategy={strategy} />
      </div>

      {/* Item Winner / Exposure status */}
      {Object.keys(wingKpis).length > 0 && (
        <div className="rounded-xl border border-slate-100 p-5 bg-white">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-[16px] font-bold text-slate-900">아이템위너 · 노출 현황</h2>
            <span className="text-[13px] text-slate-400">아이템위너 미보유 시 광고 전환율 급감</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(wingKpis).map(([label, value]) => {
              const isWarning = label.includes('노출제한') || label.includes('아이템위너 아닌') || label.includes('미보유');
              const hasIssue = isWarning && parseInt(String(value)) > 0;
              return (
                <div key={label} className={`rounded-lg border p-4 text-center ${hasIssue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                  <div className={`text-2xl font-extrabold tabular-nums ${hasIssue ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
                  <div className={`text-[13px] mt-1 font-medium ${hasIssue ? 'text-red-500' : 'text-slate-500'}`}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABC Budget allocation */}
      {trends?.daily?.length && trends.budgetAllocation ? (
        <div className="rounded-xl border border-slate-100 p-5 w-full lg:w-1/2 bg-white">
          <h3 className="text-[15px] font-bold text-slate-900 mb-4">ABC 등급별 예산 배분</h3>
          <div className="space-y-4">
            {trends.budgetAllocation.map((b) => {
              const gap = b.pct - b.target;
              return (
                <div key={b.grade}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center text-sm font-black text-white ${b.grade === 'A' ? 'bg-emerald-500' : b.grade === 'B' ? 'bg-amber-500' : 'bg-red-500'}`}>{b.grade}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-semibold text-slate-800">{b.pct}%<span className="text-slate-400 font-normal ml-1">/ {b.target}%</span></span>
                        <span className={`text-[12px] font-bold ${gap > 5 ? 'text-red-500' : gap < -5 ? 'text-amber-600' : 'text-emerald-600'}`}>{gap > 5 ? `+${gap}%p` : gap < -5 ? `${gap}%p` : '적정'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${b.grade === 'A' ? 'bg-emerald-500' : b.grade === 'B' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[11px] text-slate-400">
                    <span>{formatKRW(b.spend)}원</span><span>ROAS {b.roas}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
