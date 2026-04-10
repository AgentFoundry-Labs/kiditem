'use client';

import {
  QUALITY_GRADE_COLORS,
  QUALITY_GRADE_BG,
  QUALITY_GRADE_TEXT,
  COMPLIANCE_GRADE_COLORS,
  COMPLIANCE_GRADE_BG,
  COMPLIANCE_GRADE_TEXT,
  COMPLIANCE_GRADE_LABELS,
} from '../lib/grade-constants';

interface GradeDonutChartProps {
  gradeDistribution: Record<string, number>;
  totalCount: number;
  avgScore: number;
  healthGrade: string;
  complianceDistribution?: Record<string, number>;
  onGradeClick: (grade: string) => void;
}

export function GradeDonutChart({
  gradeDistribution,
  totalCount,
  avgScore,
  healthGrade,
  complianceDistribution,
  onGradeClick,
}: GradeDonutChartProps) {
  const r = 46;
  const circumference = 2 * Math.PI * r;

  // Compliance donut segments
  const complianceTotal = complianceDistribution
    ? (complianceDistribution['PASS'] || 0) + (complianceDistribution['WARN'] || 0) + (complianceDistribution['FAIL'] || 0)
    : 0;

  let complianceOffset = 0;
  const complianceSegments = complianceDistribution && complianceTotal > 0
    ? (['PASS', 'WARN', 'FAIL'] as const).map((g) => {
        const count = complianceDistribution[g] || 0;
        const pct = count / complianceTotal;
        const dash = pct * circumference;
        const currentOffset = complianceOffset;
        complianceOffset += dash;
        return { g, dash, offset: currentOffset, color: COMPLIANCE_GRADE_COLORS[g] };
      }).filter((s) => s.dash > 0)
    : [];

  // Quality donut segments (fallback when no compliance data)
  let qualityOffset = 0;
  const qualitySegments = (['S', 'A', 'B', 'C', 'F'] as const).map((g) => {
    const count = gradeDistribution[g] || 0;
    const pct = totalCount > 0 ? count / totalCount : 0;
    const dash = pct * circumference;
    const currentOffset = qualityOffset;
    qualityOffset += dash;
    return { g, dash, offset: currentOffset, color: QUALITY_GRADE_COLORS[g] };
  }).filter((s) => s.dash > 0);

  const showCompliance = complianceSegments.length > 0;
  const passCount = complianceDistribution?.['PASS'] || 0;
  const failCount = complianceDistribution?.['FAIL'] || 0;
  const complianceHealthPct = complianceTotal > 0 ? Math.round((passCount / complianceTotal) * 100) : 0;

  return (
    <div className="rounded-2xl px-5 py-5 bg-white shadow-md border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold uppercase tracking-wider text-slate-900">
          {showCompliance ? '준수율 분포' : '등급 분포'}
        </span>
        <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md text-slate-600 bg-slate-50">
          총 {showCompliance ? complianceTotal : totalCount}개
        </span>
      </div>

      <div className="flex justify-center mb-4">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {showCompliance
              ? complianceSegments.map(({ g, dash, offset: off, color }) => (
                  <circle
                    key={g}
                    cx="60" cy="60" r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="18"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-off}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onGradeClick(g)}
                  />
                ))
              : qualitySegments.map(({ g, dash, offset: off, color }) => (
                  <circle
                    key={g}
                    cx="60" cy="60" r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="18"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-off}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onGradeClick(g)}
                  />
                ))
            }
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {showCompliance ? (
              <>
                <span className="text-2xl font-black tabular-nums text-slate-900">{complianceHealthPct}%</span>
                <span className={`text-xs font-black ${failCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {failCount > 0 ? '위반있음' : '준수중'}
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-black tabular-nums text-slate-900">{avgScore}</span>
                <span className={`text-xs font-black ${QUALITY_GRADE_TEXT[healthGrade] || 'text-slate-500'}`}>{healthGrade}등급</span>
              </>
            )}
          </div>
        </div>
      </div>

      {showCompliance ? (
        <div className="space-y-2">
          {(['PASS', 'WARN', 'FAIL'] as const).map((g) => {
            const count = complianceDistribution?.[g] || 0;
            const pct = complianceTotal > 0 ? Math.round((count / complianceTotal) * 100) : 0;
            return (
              <button
                key={g}
                onClick={() => onGradeClick(g)}
                className="w-full flex items-center gap-2.5 hover:opacity-70 transition-opacity group"
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black text-white flex-shrink-0 ${COMPLIANCE_GRADE_BG[g]}`}>
                  {g === 'PASS' ? '✓' : g === 'WARN' ? '!' : '✗'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="h-2.5 rounded-full overflow-hidden bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${COMPLIANCE_GRADE_BG[g]}`}
                      style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold tabular-nums w-20 text-right flex-shrink-0 text-slate-900">
                  {COMPLIANCE_GRADE_LABELS[g]} <span className="text-slate-400">{pct}%</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {(['S', 'A', 'B', 'C', 'F'] as const).map((g) => {
            const count = gradeDistribution[g] || 0;
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            return (
              <button
                key={g}
                onClick={() => onGradeClick(g)}
                className="w-full flex items-center gap-2.5 hover:opacity-70 transition-opacity group"
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black text-white flex-shrink-0 ${QUALITY_GRADE_BG[g]}`}>{g}</span>
                <div className="flex-1 min-w-0">
                  <div className="h-2.5 rounded-full overflow-hidden bg-slate-200">
                    <div className={`h-full rounded-full transition-all duration-300 ${QUALITY_GRADE_BG[g]}`} style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }} />
                  </div>
                </div>
                <span className="text-xs font-bold tabular-nums w-14 text-right flex-shrink-0 text-slate-900">
                  {count}개 <span className="text-slate-400">{pct}%</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
