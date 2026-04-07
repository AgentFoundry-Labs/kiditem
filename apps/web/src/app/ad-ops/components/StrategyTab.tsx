'use client';

import { useState } from 'react';
import {
  Brain, RefreshCw, ChevronDown, XCircle, AlertTriangle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import type { AdRulesData, AdWeeklyPlan } from '@kiditem/shared';

interface RecommendCard {
  icon: string;
  title: string;
  color: string;
  items: Array<{ productName?: string; text: string; value?: string; priority?: string }>;
}

interface Props {
  rules: AdRulesData['recommendations'];
  strategy: AdWeeklyPlan | undefined;
  strategyCards: RecommendCard[];
}

export function StrategyTab({ rules, strategy, strategyCards }: Props) {
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const gradeConfigs = [
    { grade: 'A', title: '핵심 상품', subtitle: '공격 확장', desc: '예산 증액, 키워드 확장, 입찰가 인상', pills: ['일예산 20%↑', '1차 키워드 승격', '입찰가 인상'], border: 'border-emerald-300', bg: 'bg-gradient-to-br from-emerald-50 to-green-50/50', pillBg: 'bg-emerald-100 text-emerald-700', moreColor: 'text-emerald-600', target: 60, ring: 'ring-emerald-400', headerGrad: 'from-emerald-600 to-green-600' },
    { grade: 'B', title: '성장 후보', subtitle: '최적화 집중', desc: '키워드 정리, 입찰 조정, 썸네일 테스트', pills: ['전환0 키워드 OFF', '입찰가 15%↓', '롱테일 확장'], border: 'border-amber-300', bg: 'bg-gradient-to-br from-amber-50 to-yellow-50/50', pillBg: 'bg-amber-100 text-amber-700', moreColor: 'text-amber-600', target: 30, ring: 'ring-amber-400', headerGrad: 'from-amber-500 to-yellow-500' },
    { grade: 'C', title: '정리 대상', subtitle: '손절 · 재구성', desc: '예산 축소, 캠페인 OFF, 가격 재검토', pills: ['일예산 축소', '캠페인 OFF', '가격 재검토'], border: 'border-red-300', bg: 'bg-gradient-to-br from-red-50 to-pink-50/50', pillBg: 'bg-red-100 text-red-700', moreColor: 'text-red-600', target: 10, ring: 'ring-red-400', headerGrad: 'from-red-500 to-pink-500' },
  ];

  const totalSpend = rules.reduce((s, r) => s + (r.spend || 0), 0);
  const gradeData = gradeConfigs.map(cfg => {
    const gradeRules = cfg.grade === 'A'
      ? rules.filter(r => r.grade === 'A' || (r.roas >= 480 && r.spend > 0))
      : cfg.grade === 'B'
        ? rules.filter(r => r.grade === 'B' || (r.roas >= 100 && r.roas < 480 && r.spend > 0))
        : rules.filter(r => (r.grade === 'C' || r.roas < 100) && r.spend > 0);
    const gradeSpend = gradeRules.reduce((s, r) => s + (r.spend || 0), 0);
    const pct = totalSpend > 0 ? Math.round((gradeSpend / totalSpend) * 100) : 0;
    const strategyActions = (strategy?.actions || []).filter(a => a.grade === cfg.grade);
    return { ...cfg, rules: gradeRules, pct, strategyActions };
  });

  return (
    <div className="space-y-5">
      {/* ABC Grade strategy cards */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {gradeData.map(g => {
            const isSelected = selectedGrade === g.grade;
            const totalCount = g.rules.length + g.strategyActions.length;
            const urgents = g.rules.filter(r => r.priority === 'urgent').length;
            return (
              <button key={g.grade} onClick={() => setSelectedGrade(isSelected ? null : g.grade)}
                className={`text-left rounded-2xl border-2 ${g.border} ${g.bg} overflow-hidden transition-all duration-200 ${isSelected ? `ring-2 ${g.ring} shadow-xl scale-[1.01]` : 'hover:shadow-lg hover:scale-[1.005]'}`}>
                <div className={`bg-gradient-to-r ${g.headerGrad} px-4 py-2.5 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-white">{g.grade}</span>
                    <div>
                      <div className="text-[13px] font-bold text-white leading-tight">{g.title}</div>
                      <div className="text-[10px] text-white/80">{g.subtitle}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-white">{totalCount}</div>
                    <div className="text-[9px] text-white/80">제안</div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-600">예산 비중</span><span className="font-bold text-slate-800">{g.pct}% <span className="font-normal text-slate-400">/ {g.target}%</span></span></div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${g.headerGrad}`} style={{ width: `${Math.min(g.pct, 100)}%` }} /></div>
                  </div>
                  <p className="text-[12px] text-slate-600 mb-2">{g.desc}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {g.pills.map(pill => <span key={pill} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${g.pillBg}`}>{pill}</span>)}
                  </div>
                  {g.rules.slice(0, 2).map((r, i) => (
                    <div key={`r-${i}`} className="flex items-start justify-between gap-2 bg-transparent/80 rounded-lg px-2.5 py-1.5 mb-1.5">
                      <div className="min-w-0"><div className="text-[12px] font-bold text-slate-800 truncate">{r.name?.substring(0, 25)}</div><div className="text-[11px] text-slate-500 truncate">{r.action?.substring(0, 40)}</div></div>
                      {(r.priority === 'urgent' || r.priority === 'high') && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${r.priority === 'urgent' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'}`}>{r.priority === 'urgent' ? '긴급' : '높음'}</span>}
                    </div>
                  ))}
                  {totalCount > 0 && <div className={`flex items-center justify-center gap-1 mt-2 text-[11px] font-semibold ${g.moreColor}`}>{isSelected ? '접기' : `전체 ${totalCount}건 보기`}<ChevronDown size={13} className={`transition-transform ${isSelected ? 'rotate-180' : ''}`} /></div>}
                  {urgents > 0 && <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600"><AlertTriangle size={11} /> 긴급 {urgents}건</div>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected grade detail */}
        {selectedGrade && (() => {
          const g = gradeData.find(d => d.grade === selectedGrade);
          if (!g) return null;
          const allItems = [
            ...g.rules.map(r => ({ type: 'rule' as const, name: r.name, action: r.action, priority: r.priority, roas: r.roas })),
            ...g.strategyActions.map(a => ({ type: 'strategy' as const, name: a.name, action: a.reason, priority: a.action === 'stop' ? 'urgent' : a.action === 'decrease' ? 'high' : 'medium', roas: a.roas })),
          ];
          const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          allItems.sort((a, b) => (priOrder[a.priority as keyof typeof priOrder] || 3) - (priOrder[b.priority as keyof typeof priOrder] || 3));
          return (
            <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${g.headerGrad}`}>
                <h3 className="text-[14px] font-bold text-white">{selectedGrade}등급 전체 제안 — {allItems.length}건</h3>
                <button onClick={() => setSelectedGrade(null)} className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"><XCircle size={16} /></button>
              </div>
              {allItems.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">제안 없음</div> : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {allItems.map((item, i) => (
                    <div key={i} className="px-5 py-3 hover:bg-slate-50/80">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${item.priority === 'urgent' ? 'bg-red-100 text-red-700' : item.priority === 'high' ? 'bg-orange-100 text-orange-700' : item.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{item.priority === 'urgent' ? '긴급' : item.priority === 'high' ? '높음' : item.priority === 'medium' ? '보통' : '낮음'}</span>
                            <span className="text-[13px] font-bold text-slate-900 truncate">{item.name}</span>
                          </div>
                          <div className="text-[12px] text-slate-700">{item.action}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-[16px] font-extrabold tabular-nums ${item.roas >= 300 ? 'text-emerald-600' : item.roas >= 100 ? 'text-amber-600' : item.roas > 0 ? 'text-red-500' : 'text-slate-300'}`}>{item.roas > 0 ? `${item.roas}%` : '-'}</div>
                          <div className="text-[10px] text-slate-400">ROAS</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* AI report cards */}
      {strategyCards.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Brain size={16} className="text-violet-500" /><h2 className="text-[15px] font-bold text-slate-900">AI 분석 리포트</h2></div>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.ads.recommend() })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-violet-600 hover:bg-violet-50 font-semibold"><RefreshCw size={12} /> 새로고침</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {strategyCards.map((card, ci) => (
              <div key={ci} className={`shrink-0 w-[300px] bg-gradient-to-br ${card.color} rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex items-center gap-2 mb-3"><span className="text-xl">{card.icon}</span><span className="text-[14px] font-bold text-slate-800">{card.title}</span></div>
                <div className="space-y-2">
                  {card.items.map((item, ii) => (
                    <div key={ii} className="bg-transparent/80 rounded-lg p-2.5">
                      {item.productName && <div className="text-[12px] font-bold text-slate-800 truncate">{item.productName}</div>}
                      <div className="text-[12px] text-slate-600 leading-relaxed">{item.text}</div>
                      {item.value && <div className={`text-[11px] font-semibold mt-0.5 ${item.priority === 'urgent' ? 'text-red-600' : item.priority === 'high' ? 'text-emerald-600' : 'text-slate-500'}`}>{'\u2192'} {item.value}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
