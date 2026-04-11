'use client';
import { cn } from '@/lib/utils';
import type { ThumbnailScores } from '@kiditem/shared';

interface ScoreBreakdownProps {
  scores: ThumbnailScores;
}

export function ScoreBreakdown({ scores }: ScoreBreakdownProps) {
  const items = [
    { label: '히어로 샷 품질', score: scores.heroShot, max: 25, desc: '각도, 조명, 선명도' },
    { label: '구도 / 레이아웃', score: scores.composition, max: 25, desc: '중앙 정렬, 여백, 배치' },
    { label: '브랜드 일관성', score: scores.branding, max: 15, desc: '톤 통일, 반복 패턴' },
    { label: '모바일 매력도', score: scores.mobile, max: 20, desc: '작은 화면 가독성, 대비' },
    { label: '경쟁 차별화', score: scores.differentiation, max: 15, desc: '검색 내 시각적 차별화' },
  ];
  const total = items.reduce((s, i) => s + i.score, 0);

  return (
    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-mono text-slate-500 uppercase">항목별 채점</span>
        <span
          className={cn(
            'text-sm font-black tabular-nums',
            total >= 75 ? 'text-emerald-600' : total >= 40 ? 'text-amber-600' : 'text-red-600'
          )}
        >
          {total}<span className="text-xs font-medium text-slate-400">/100</span>
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
          const color = pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-900">{item.label}</span>
                  <span className="text-[10px] text-slate-400">{item.desc}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black tabular-nums" style={{ color }}>{item.score}</span>
                  <span className="text-[10px] text-slate-400">/{item.max}</span>
                  {pct < 50 && (
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ background: `${color}15`, color }}
                    >
                      감점
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${color}15` }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
