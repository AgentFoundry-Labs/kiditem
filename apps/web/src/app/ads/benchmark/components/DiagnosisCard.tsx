'use client';

import { formatKRW } from '@/lib/utils';

const GRADE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-400' },
  'B+': { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-400' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-400' },
  'B-': { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-400' },
  C: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-400' },
  D: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-400' },
};

interface Diagnosis {
  overallGrade: string;
  overallMessage: string;
  statusCounts: Record<string, number>;
  priorityImprovements: Array<{ metric: string; label: string; gap: number; strategy: string }>;
  strengths: Array<{ metric: string; label: string; status: string }>;
}

interface DataInfo {
  period: string;
  adRecords: number;
  totalSpend: number;
  totalAdRevenue: number;
  totalRevenue: number;
}

export function DiagnosisCard({ diagnosis, dataInfo }: { diagnosis: Diagnosis; dataInfo: DataInfo }) {
  const gradeStyle = GRADE_COLORS[diagnosis.overallGrade] ?? GRADE_COLORS.C;

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <div className="flex items-start gap-6">
        {/* Grade badge */}
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ring-4 ${gradeStyle.bg} ${gradeStyle.ring}`}>
          <span className={`text-3xl font-black ${gradeStyle.text}`}>{diagnosis.overallGrade}</span>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 text-lg mb-1">종합 진단</h3>
          <p className="text-sm text-slate-600 mb-3">{diagnosis.overallMessage}</p>

          <div className="flex gap-4 text-xs text-slate-500">
            <span>기간: <strong className="text-slate-700">{dataInfo.period}</strong></span>
            <span>분석: <strong className="text-slate-700">{dataInfo.adRecords}건</strong></span>
            <span>광고비: <strong className="text-slate-700">{formatKRW(dataInfo.totalSpend)}원</strong></span>
            <span>매출: <strong className="text-slate-700">{formatKRW(dataInfo.totalAdRevenue)}원</strong></span>
          </div>
        </div>
      </div>

      {/* Priority improvements */}
      {diagnosis.priorityImprovements.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <h4 className="text-sm font-semibold text-red-700 mb-2">우선 개선 항목</h4>
          <div className="space-y-2">
            {diagnosis.priorityImprovements.map((item) => (
              <div key={item.metric} className="flex items-center gap-3 text-sm">
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">{item.label}</span>
                <span className="text-slate-600 flex-1">{item.strategy}</span>
                <span className="text-red-500 text-xs font-medium">Gap: {item.gap.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {diagnosis.strengths.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <h4 className="text-sm font-semibold text-emerald-700 mb-2">강점 항목</h4>
          <div className="flex flex-wrap gap-2">
            {diagnosis.strengths.map((item) => (
              <span key={item.metric} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
