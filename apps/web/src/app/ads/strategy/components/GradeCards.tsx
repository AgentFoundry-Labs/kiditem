'use client';

import { useState } from 'react';

const GRADE_CONFIGS = [
  {
    grade: 'A',
    title: '핵심 상품',
    subtitle: '공격 확장',
    theme: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-600', text: 'text-emerald-900', bar: 'bg-emerald-500' },
    budgetTarget: 80,
    tags: ['입찰가 상향', '노출 극대화', '키워드 확장'],
  },
  {
    grade: 'B',
    title: '성장 후보',
    subtitle: '최적화 집중',
    theme: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-600', text: 'text-amber-900', bar: 'bg-amber-500' },
    budgetTarget: 15,
    tags: ['효율 모니터링', 'ROAS 개선', '전환율 테스트'],
  },
  {
    grade: 'C',
    title: '정리 대상',
    subtitle: '손절/재구성',
    theme: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-600', text: 'text-red-900', bar: 'bg-red-500' },
    budgetTarget: 5,
    tags: ['예산 축소', '키워드 정리', '광고 중단 검토'],
  },
];

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
  low: { bg: 'bg-gray-100', text: 'text-gray-700' },
};

interface RuleItem {
  rule: string;
  grade?: string;
  priority?: string;
  action?: string;
}

interface BudgetAllocationItem {
  grade: string;
  currentPercent: number;
  targetPercent: number;
  gap: number;
}

interface Props {
  budgetAllocation?: BudgetAllocationItem[];
  rules?: RuleItem[];
}

export function GradeCards({ budgetAllocation, rules }: Props) {
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-slate-900">ABC 등급 전략</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GRADE_CONFIGS.map((cfg) => {
          const currentPct = budgetAllocation?.find((b) => b.grade === cfg.grade)?.currentPercent ?? 0;
          const gradeRules = (rules ?? []).filter((r) => r.grade === cfg.grade);
          const isExpanded = selectedGrade === cfg.grade;

          return (
            <div
              key={cfg.grade}
              onClick={() => setSelectedGrade(isExpanded ? null : cfg.grade)}
              className={`rounded-xl p-5 border cursor-pointer transition-all ${cfg.theme.bg} ${cfg.theme.border} ${isExpanded ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className={`inline-block w-8 h-8 rounded-lg text-white text-sm font-bold flex items-center justify-center ${cfg.theme.badge}`}>
                    {cfg.grade}
                  </span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${cfg.theme.text}`}>{cfg.title}</div>
                  <div className="text-xs text-slate-500">{cfg.subtitle}</div>
                </div>
              </div>

              {/* Budget bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">예산 비중</span>
                  <span className={cfg.theme.text}>{currentPct}% / {cfg.budgetTarget}%</span>
                </div>
                <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${cfg.theme.bar}`} style={{ width: `${Math.min(currentPct, 100)}%` }} />
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-2">
                {cfg.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-white/60 text-slate-600">{tag}</span>
                ))}
              </div>

              {/* Preview (top 2 rules) */}
              {gradeRules.length > 0 && !isExpanded && (
                <div className="text-xs text-slate-500 mt-2">
                  {gradeRules.slice(0, 2).map((r, i) => (
                    <div key={i} className="truncate">{r.action || r.rule}</div>
                  ))}
                  {gradeRules.length > 2 && <span className="text-blue-500">+{gradeRules.length - 2}건 더보기</span>}
                </div>
              )}

              {/* Expanded rules */}
              {isExpanded && gradeRules.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                  {gradeRules.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {r.priority && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${PRIORITY_STYLE[r.priority]?.bg ?? 'bg-gray-100'} ${PRIORITY_STYLE[r.priority]?.text ?? 'text-gray-700'}`}>
                          {r.priority}
                        </span>
                      )}
                      <span className="text-slate-700">{r.action || r.rule}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
