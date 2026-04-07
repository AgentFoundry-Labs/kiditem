'use client';

import { useState, useMemo } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { AdRulesData, AdWeeklyPlan } from '@kiditem/shared';

interface Props {
  rules: AdRulesData['recommendations'];
  strategy: AdWeeklyPlan | undefined;
}

export function AdActionPanel({ rules, strategy }: Props) {
  const [panelTab, setPanelTab] = useState<'actions' | 'todos'>('actions');
  const urgentCount = rules.filter(r => r.priority === 'urgent').length;
  const todoCount = strategy?.actions?.filter(a => a.action === 'stop' || a.action === 'decrease').length || 0;

  const todos = useMemo(() => {
    const items: { label: string; detail: string; priority: string }[] = [];
    if (strategy?.adIssues) {
      const iss = strategy.adIssues;
      if (iss.zeroConversion > 0) items.push({ label: `전환 0 상품 ${iss.zeroConversion}개 — 키워드 OFF`, detail: '클릭만 발생, 전환 없는 광고 중단', priority: 'urgent' });
      if (iss.cGradeHighTier > 0) items.push({ label: `C등급 고광고 ${iss.cGradeHighTier}개 — 광고 축소`, detail: 'C등급에 1차 광고 배정 중', priority: 'high' });
      if (iss.aGradeNoAd > 0) items.push({ label: `A등급 미광고 ${iss.aGradeNoAd}개 — 광고 시작`, detail: '핵심 상품에 광고 미배정', priority: 'high' });
      if (iss.lowRoas > 0) items.push({ label: `저ROAS ${iss.lowRoas}개 — 입찰가 하향`, detail: 'ROAS 200% 미만 캠페인', priority: 'medium' });
    }
    strategy?.actions?.forEach(a => {
      if (a.action === 'stop' || a.action === 'decrease') {
        items.push({ label: a.name.substring(0, 18), detail: a.reason, priority: a.action === 'stop' ? 'urgent' : 'high' });
      }
    });
    return items.slice(0, 10);
  }, [strategy]);

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden flex flex-col h-full bg-white">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
        <button onClick={() => setPanelTab('actions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${panelTab === 'actions' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
          <Sparkles size={12} />
          AI 액션 {urgentCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${panelTab === 'actions' ? 'bg-white text-blue-600' : 'bg-red-600 text-white'}`}>{urgentCount}</span>}
        </button>
        <button onClick={() => setPanelTab('todos')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${panelTab === 'todos' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>
          <AlertTriangle size={12} />
          해야할 일 {todoCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white bg-red-600">{todoCount}</span>}
        </button>
      </div>

      {panelTab === 'actions' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {rules.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate-400">처리할 광고 액션이 없습니다</div>
          ) : rules.slice(0, 10).map((r, i) => {
            const prioColor = r.priority === 'urgent' ? '#dc2626' : r.priority === 'high' ? '#f59e0b' : '#6b7280';
            return (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-slate-100">
                <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: prioColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-900">{r.name}</div>
                  <div className="text-[11px] mt-0.5 text-slate-400">{r.action}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {panelTab === 'todos' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate-400">처리할 업무가 없습니다</div>
          ) : todos.map((t, i) => {
            const prioColor = t.priority === 'urgent' ? '#dc2626' : t.priority === 'high' ? '#f59e0b' : '#6b7280';
            return (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-slate-100">
                <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: prioColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-900">{t.label}</div>
                  <div className="text-[11px] mt-0.5 text-slate-400">{t.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
