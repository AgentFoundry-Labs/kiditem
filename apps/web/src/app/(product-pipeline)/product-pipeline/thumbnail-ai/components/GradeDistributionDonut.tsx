interface GradeDistributionDonutProps {
  analyzedCount: number;
  avgScore: number;
  healthGrade: string;
  gradeDistribution: Record<string, number>;
  onSelectGrade: (grade: string) => void;
}

const GRADES = ['S', 'A', 'B', 'C', 'F'] as const;

const gradeLabel: Record<string, string> = {
  S: '양호',
  A: '보통',
  B: '주의',
  C: '미흡',
  F: '위험',
};

const solidColors: Record<string, string> = {
  S: '#10b981',
  A: '#3b82f6',
  B: '#f59e0b',
  C: '#f97316',
  F: '#ef4444',
};

const grads: Record<string, string> = {
  S: 'linear-gradient(90deg, #a7f3d0, #34d399, #059669)',
  A: 'linear-gradient(90deg, #bfdbfe, #60a5fa, #2563eb)',
  B: 'linear-gradient(90deg, #fef3c7, #fbbf24, #d97706)',
  C: 'linear-gradient(90deg, #fed7aa, #fb923c, #ea580c)',
  F: 'linear-gradient(90deg, #fecaca, #f87171, #dc2626)',
};

export function GradeDistributionDonut({
  analyzedCount,
  avgScore,
  healthGrade,
  gradeDistribution,
  onSelectGrade,
}: GradeDistributionDonutProps) {
  const r = 78;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const gradMap: Record<string, string> = {
    S: 'url(#gradS)',
    A: 'url(#gradA)',
    B: 'url(#gradB)',
    C: 'url(#gradC)',
    F: 'url(#gradF)',
  };

  return (
    <div
      className="lg:col-span-2 rounded-2xl px-5 py-5"
      style={{
        background: 'var(--thumb-card-bg)',
        boxShadow: 'var(--thumb-shadow-md)',
        border: '1px solid var(--thumb-border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[15px] font-bold" style={{ color: 'var(--thumb-text-primary)' }}>
          등급 분포
        </span>
        <span
          className="text-[12px] tabular-nums px-2.5 py-1 rounded-md font-semibold"
          style={{ color: 'var(--thumb-text-secondary)', background: 'var(--thumb-surface-sunken)' }}
        >
          분류 {analyzedCount}개
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative w-56 h-56 flex-shrink-0">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <defs>
              <linearGradient id="gradS" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a7f3d0" />
                <stop offset="50%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="gradA" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#bfdbfe" />
                <stop offset="50%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="gradB" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef3c7" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="gradC" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fed7aa" />
                <stop offset="50%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
              <linearGradient id="gradF" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fecaca" />
                <stop offset="50%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
              <filter id="donutShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.18" />
              </filter>
            </defs>
            <circle cx="100" cy="100" r="78" fill="none" stroke="var(--thumb-surface-sunken)" strokeWidth="22" />
            {GRADES.map((g) => {
              const count = gradeDistribution[g] || 0;
              const pct = analyzedCount > 0 ? count / analyzedCount : 0;
              const dash = pct * circumference;
              const currentOffset = offset;
              offset += dash;
              if (dash === 0) return null;
              return (
                <circle
                  key={g}
                  cx="100"
                  cy="100"
                  r={r}
                  fill="none"
                  stroke={gradMap[g]}
                  strokeWidth="22"
                  strokeDasharray={`${dash - 2} ${circumference - dash + 2}`}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="round"
                  filter="url(#donutShadow)"
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => onSelectGrade(g)}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-[52px] font-black tabular-nums leading-none"
              style={{ color: 'var(--thumb-text-primary)' }}
            >
              {avgScore}
            </span>
            <span
              className="text-[13px] font-black mt-2 px-3 py-1 rounded-md text-white"
              style={{ background: solidColors[healthGrade] }}
            >
              {gradeLabel[healthGrade]}
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {GRADES.map((g) => {
            const count = gradeDistribution[g] || 0;
            const pct = analyzedCount > 0 ? Math.round((count / analyzedCount) * 100) : 0;
            return (
              <button
                key={g}
                onClick={() => onSelectGrade(g)}
                className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <span
                  className="text-[15px] font-black w-5 text-left shrink-0"
                  style={{ color: solidColors[g] }}
                >
                  {g}
                </span>
                <div
                  className="flex-1 h-4 rounded-full overflow-hidden"
                  style={{ background: 'var(--thumb-border-subtle)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`,
                      background: grads[g],
                    }}
                  />
                </div>
                <span
                  className="text-[14px] font-black tabular-nums w-16 text-right shrink-0"
                  style={{ color: 'var(--thumb-text-primary)' }}
                >
                  {count}
                  <span
                    className="ml-1.5 text-[11px] font-semibold"
                    style={{ color: 'var(--thumb-text-quaternary)' }}
                  >
                    {pct}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
