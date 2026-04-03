'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Sparkles, AlertTriangle, ChevronDown } from 'lucide-react';
import { roasColor } from '../../lib/status-colors';

const GRADE_STYLES: Record<string, { border: string; bg: string; pillBg: string; moreColor: string; ring: string; headerGrad: string }> = {
  A: { border: 'border-emerald-300', bg: 'bg-gradient-to-br from-emerald-50 to-green-50/50', pillBg: 'bg-emerald-100 text-emerald-700', moreColor: 'text-emerald-600', ring: 'ring-emerald-400', headerGrad: 'from-emerald-600 to-green-600' },
  B: { border: 'border-amber-300', bg: 'bg-gradient-to-br from-amber-50 to-yellow-50/50', pillBg: 'bg-amber-100 text-amber-700', moreColor: 'text-amber-600', ring: 'ring-amber-400', headerGrad: 'from-amber-500 to-yellow-500' },
  C: { border: 'border-red-300', bg: 'bg-gradient-to-br from-red-50 to-pink-50/50', pillBg: 'bg-red-100 text-red-700', moreColor: 'text-red-600', ring: 'ring-red-400', headerGrad: 'from-red-500 to-pink-500' },
};

const FALLBACK_STRATEGY: Record<string, { title: string; subtitle: string; pills: string[]; budgetTarget: number }> = {
  A: { title: '핵심 상품', subtitle: '공격 확장', pills: ['일예산 20%↑', '1차 키워드 승격', '입찰가 인상'], budgetTarget: 60 },
  B: { title: '성장 후보', subtitle: '최적화 집중', pills: ['전환0 키워드 OFF', '입찰가 15%↓', '롱테일 확장'], budgetTarget: 30 },
  C: { title: '정리 대상', subtitle: '손절 · 재구성', pills: ['일예산 축소', '캠페인 OFF', '가격 재검토'], budgetTarget: 10 },
};

interface RuleItem {
  rule: string;
  grade?: string;
  priority?: string;
  action?: string;
  name?: string;
  roas?: number;
  spend?: number;
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

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{
      roas: { thresholds: { excellent: number; warning: number; poor: number } };
      gradeStrategy: Record<string, { title: string; subtitle: string; pills: string[]; budgetTarget: number }>;
    }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const totalSpend = (rules ?? []).reduce((s, r) => s + (r.spend || 0), 0);

  const gradeData = ['A', 'B', 'C'].map((grade) => {
    const strategy = adsConfig?.gradeStrategy?.[grade] ?? FALLBACK_STRATEGY[grade];
    const style = GRADE_STYLES[grade];
    const gradeRules = (rules ?? []).filter((r) => r.grade === grade);
    const gradeSpend = gradeRules.reduce((s, r) => s + (r.spend || 0), 0);
    const pct = budgetAllocation?.find((b) => b.grade === grade)?.currentPercent
      ?? (totalSpend > 0 ? Math.round((gradeSpend / totalSpend) * 100) : 0);
    return {
      grade,
      title: strategy.title,
      subtitle: strategy.subtitle,
      desc: strategy.pills.join(', '),
      pills: strategy.pills,
      target: strategy.budgetTarget,
      ...style,
      rules: gradeRules,
      pct,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-violet-500" />
        <h2 className="text-lg font-bold text-slate-900">ABC 등급별 AI 전략</h2>
        <span className="text-[12px] text-slate-400 ml-1">카드를 클릭하면 상세 제안을 볼 수 있습니다</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {gradeData.map((g) => {
          const isSelected = selectedGrade === g.grade;
          const totalCount = g.rules.length;
          const urgents = g.rules.filter((r) => r.priority === 'urgent').length;

          return (
            <button
              key={g.grade}
              onClick={() => setSelectedGrade(isSelected ? null : g.grade)}
              className={`text-left rounded-2xl border-2 ${g.border} ${g.bg} overflow-hidden transition-all duration-200 ${
                isSelected ? `ring-2 ${g.ring} shadow-xl scale-[1.01]` : 'hover:shadow-lg hover:scale-[1.005]'
              }`}
            >
              {/* 등급 헤더 바 */}
              <div className={`bg-gradient-to-r ${g.headerGrad} px-5 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white">{g.grade}</span>
                  <div>
                    <div className="text-[14px] font-bold text-white leading-tight">{g.title}</div>
                    <div className="text-[11px] text-white/80">{g.subtitle}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-white">{totalCount}</div>
                  <div className="text-[10px] text-white/80">제안</div>
                </div>
              </div>

              <div className="p-5">
                {/* 예산 비중 바 */}
                <div className="mb-4">
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span className="font-medium text-slate-600">예산 비중</span>
                    <span className="font-bold text-slate-800">
                      {g.pct}% <span className="font-normal text-slate-400">/ 목표 {g.target}%</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${g.headerGrad} transition-all duration-500`}
                      style={{ width: `${Math.min(g.pct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 전략 설명 */}
                <p className="text-[13px] text-slate-600 mb-3 leading-relaxed">{g.desc}</p>

                {/* 태그 */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {g.pills.map((pill) => (
                    <span key={pill} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${g.pillBg}`}>
                      {pill}
                    </span>
                  ))}
                </div>

                {/* 제안 미리보기 */}
                <div className="space-y-2">
                  {g.rules.slice(0, 2).map((r, i) => (
                    <div key={`r-${i}`} className="flex items-start justify-between gap-2 bg-white/80 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-800 truncate">
                          {(r.name || r.rule)?.substring(0, 30)}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {r.action?.substring(0, 45)}
                        </div>
                      </div>
                      {(r.priority === 'urgent' || r.priority === 'high') && (
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.priority === 'urgent' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {r.priority === 'urgent' ? '긴급' : '높음'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* 더보기 힌트 */}
                {totalCount > 0 && (
                  <div className={`flex items-center justify-center gap-1 mt-3 text-[12px] font-semibold ${g.moreColor}`}>
                    {isSelected ? '접기' : `전체 ${totalCount}건 보기`}
                    <ChevronDown size={14} className={`transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                  </div>
                )}

                {urgents > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-red-600">
                    <AlertTriangle size={12} /> 긴급 조치 필요 {urgents}건
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 등급 상세 */}
      {selectedGrade && (() => {
        const g = gradeData.find((d) => d.grade === selectedGrade);
        if (!g || g.rules.length === 0) return null;
        const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        const sorted = [...g.rules].sort(
          (a, b) => (priOrder[a.priority as keyof typeof priOrder] ?? 3) - (priOrder[b.priority as keyof typeof priOrder] ?? 3),
        );
        return (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${g.headerGrad}`}>
              <h3 className="text-[15px] font-bold text-white">{selectedGrade}등급 전체 제안 — {sorted.length}건</h3>
              <button onClick={() => setSelectedGrade(null)} className="text-white/70 hover:text-white text-sm">닫기</button>
            </div>
            <div className="divide-y divide-slate-100">
              {sorted.map((r, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3">
                  {r.priority && (
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                      r.priority === 'urgent' ? 'bg-red-500 text-white' :
                      r.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      r.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {r.priority === 'urgent' ? '긴급' : r.priority === 'high' ? '높음' : r.priority === 'medium' ? '보통' : '낮음'}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-800">{r.name || r.rule}</div>
                    <div className="text-[12px] text-slate-500 mt-0.5">{r.action}</div>
                  </div>
                  {r.roas !== undefined && (
                    <span className={`shrink-0 text-[12px] font-bold tabular-nums ${roasColor(r.roas, roasT)}`}>
                      ROAS {r.roas}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
