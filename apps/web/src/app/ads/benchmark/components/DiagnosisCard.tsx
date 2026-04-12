'use client';

import { BarChart3, AlertTriangle, TrendingUp } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

const BENCH_STATUS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  excellent: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: '우수' },
  good: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', label: '양호' },
  average: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: '평균' },
  below: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', label: '미달' },
  poor: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: '부진' },
};

interface Diagnosis {
  overallGrade: string;
  overallMessage: string;
  statusCounts: Record<string, number>;
  priorityImprovements: Array<{ metric: string; label: string; gap: number; gapPercent?: number; myValue?: number; status?: string; strategy: string }>;
  strengths: Array<{ metric: string; label: string; status: string; myValue?: number; gapPercent?: number }>;
}

interface DataInfo {
  period: string;
  adRecords: number;
  totalSpend: number;
  totalAdRevenue: number;
  totalRevenue: number;
}

export function DiagnosisCard({ diagnosis, dataInfo }: { diagnosis: Diagnosis; dataInfo: DataInfo }) {
  const gradeColor = diagnosis.overallGrade === 'A' ? 'bg-emerald-100 text-emerald-700'
    : diagnosis.overallGrade.startsWith('B') ? 'bg-blue-100 text-blue-700'
    : diagnosis.overallGrade === 'C' ? 'bg-orange-100 text-orange-700'
    : 'bg-red-100 text-red-700';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">업계 평균 대비 진단</h2>
            <p className="text-[12px] text-slate-400">쿠팡 셀러 업계 평균과 비교한 내 광고 효율</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-lg text-[13px] font-extrabold ${gradeColor}`}>
            종합 {diagnosis.overallGrade}
          </span>
          <span className="text-[11px] text-slate-400">{dataInfo.period} · {dataInfo.adRecords}건</span>
        </div>
      </div>

      {/* Overall message */}
      <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100">
        <p className="text-[13px] text-slate-600 leading-relaxed">{diagnosis.overallMessage}</p>
      </div>

      {/* Priority improvements & Strengths */}
      <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {diagnosis.priorityImprovements.length > 0 && (
          <div className="rounded-xl bg-red-50/60 border border-red-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-red-500" />
              <span className="text-[13px] font-bold text-red-700">우선 개선 필요</span>
            </div>
            <div className="space-y-2">
              {diagnosis.priorityImprovements.map((c) => {
                const st = BENCH_STATUS[c.status ?? 'below'] ?? BENCH_STATUS.below;
                const unit = c.metric === 'cpc' ? '원' : '%';
                return (
                  <div key={c.metric} className="flex items-center gap-3 bg-white/70 rounded-lg px-3 py-2">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                    <span className="text-[13px] font-semibold text-slate-800">{c.label}</span>
                    {c.myValue !== undefined && (
                      <>
                        <span className="text-[12px] text-slate-500 ml-auto tabular-nums">{c.myValue}{unit}</span>
                        <span className="text-[12px] text-red-500 font-semibold tabular-nums">Gap: {c.gap.toFixed(1)}{unit}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {diagnosis.strengths.length > 0 && (
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className="text-emerald-500" />
              <span className="text-[13px] font-bold text-emerald-700">강점 — 스케일업 가능</span>
            </div>
            <div className="space-y-2">
              {diagnosis.strengths.map((c) => {
                const st = BENCH_STATUS[c.status] ?? BENCH_STATUS.good;
                const unit = c.metric === 'cpc' ? '원' : '%';
                return (
                  <div key={c.metric} className="flex items-center gap-3 bg-white/70 rounded-lg px-3 py-2">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                    <span className="text-[13px] font-semibold text-slate-800">{c.label}</span>
                    {c.myValue !== undefined && (
                      <span className="text-[12px] text-slate-500 ml-auto tabular-nums">{c.myValue}{unit}</span>
                    )}
                    {c.gapPercent !== undefined && (
                      <span className="text-[12px] text-emerald-600 font-semibold">+{Math.abs(c.gapPercent)}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
