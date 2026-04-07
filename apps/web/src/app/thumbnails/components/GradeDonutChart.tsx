'use client';

const GRADE_COLORS: Record<string, string> = {
  S: '#10b981',
  A: '#3b82f6',
  B: '#f59e0b',
  C: '#f97316',
  F: '#ef4444',
};

const GRADE_BG: Record<string, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  F: 'bg-red-500',
};

const GRADE_TEXT: Record<string, string> = {
  S: 'text-emerald-500',
  A: 'text-blue-500',
  B: 'text-amber-500',
  C: 'text-orange-500',
  F: 'text-red-500',
};

interface GradeDonutChartProps {
  gradeDistribution: Record<string, number>;
  totalCount: number;
  avgScore: number;
  healthGrade: string;
  onGradeClick: (grade: string) => void;
}

export function GradeDonutChart({ gradeDistribution, totalCount, avgScore, healthGrade, onGradeClick }: GradeDonutChartProps) {
  const r = 46;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = (['S', 'A', 'B', 'C', 'F'] as const).map((g) => {
    const count = gradeDistribution[g] || 0;
    const pct = totalCount > 0 ? count / totalCount : 0;
    const dash = pct * circumference;
    const currentOffset = offset;
    offset += dash;
    return { g, dash, offset: currentOffset, color: GRADE_COLORS[g] };
  }).filter((s) => s.dash > 0);

  return (
    <div className="rounded-2xl px-5 py-5 bg-white shadow-md border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold uppercase tracking-wider text-slate-900">등급 분포</span>
        <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md text-slate-600 bg-slate-50">총 {totalCount}개</span>
      </div>

      <div className="flex justify-center mb-4">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {segments.map(({ g, dash, offset: off, color }) => (
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
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black tabular-nums text-slate-900">{avgScore}</span>
            <span className={`text-xs font-black ${GRADE_TEXT[healthGrade] || 'text-slate-500'}`}>{healthGrade}등급</span>
          </div>
        </div>
      </div>

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
              <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black text-white flex-shrink-0 ${GRADE_BG[g]}`}>{g}</span>
              <div className="flex-1 min-w-0">
                <div className="h-2.5 rounded-full overflow-hidden bg-slate-200">
                  <div className={`h-full rounded-full transition-all duration-300 ${GRADE_BG[g]}`} style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }} />
                </div>
              </div>
              <span className="text-xs font-bold tabular-nums w-14 text-right flex-shrink-0 text-slate-900">
                {count}개 <span className="text-slate-400">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
