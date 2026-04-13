"use client";

import { useState, useMemo } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { AdWeeklyPlan } from "@kiditem/shared";

type RuleItem = { name: string; grade: string | null; rule: string; action: string; priority: string; roas: number; spend: number };

interface AdSidePanelProps {
  rules: RuleItem[];
  strategy: AdWeeklyPlan | null;
}

export default function AdSidePanel({ rules, strategy }: AdSidePanelProps) {
  const [panelTab, setPanelTab] = useState<"todos" | "alerts">("todos");

  const todos = useMemo(() => {
    const items: { label: string; detail: string; priority: string }[] = [];
    if (strategy?.adIssues) {
      const iss = strategy.adIssues;
      if (iss.zeroConversion > 0) items.push({ label: `전환 0 상품 ${iss.zeroConversion}개 — 키워드 OFF`, detail: "클릭만 발생, 전환 없는 광고 중단", priority: "urgent" });
      if (iss.cGradeHighTier > 0) items.push({ label: `C등급 고광고 ${iss.cGradeHighTier}개 — 광고 축소`, detail: "C등급에 1차 광고 배정 중", priority: "high" });
      if (iss.aGradeNoAd > 0) items.push({ label: `A등급 미광고 ${iss.aGradeNoAd}개 — 광고 시작`, detail: "핵심 상품에 광고 미배정", priority: "high" });
      if (iss.lowRoas > 0) items.push({ label: `저ROAS ${iss.lowRoas}개 — 입찰가 하향`, detail: "ROAS 200% 미만 캠페인", priority: "medium" });
    }
    strategy?.actions?.forEach(a => {
      if (a.actionPriority === "urgent" || a.actionPriority === "high") {
        items.push({ label: `${a.name?.substring(0, 18)}`, detail: a.recommendedAction, priority: a.actionPriority });
      }
    });
    return items.slice(0, 15);
  }, [strategy]);

  const todoCount = todos.length;
  const alertCount = rules.length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full" style={{ background: "#ffffff", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setPanelTab("todos")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "todos" ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
          <Sparkles size={13} />
          할 일 {todoCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: panelTab === "todos" ? "#fff" : "var(--primary)", color: panelTab === "todos" ? "var(--primary)" : "#fff" }}>{todoCount}</span>}
        </button>
        <button onClick={() => setPanelTab("alerts")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "alerts" ? { background: "var(--danger)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
          <AlertTriangle size={13} />
          알림 {alertCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white" style={{ background: "var(--danger)" }}>{alertCount}</span>}
        </button>
      </div>

      {panelTab === "todos" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>처리할 업무가 없습니다</div>
          ) : todos.map((t, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: t.priority === "urgent" ? "var(--danger)" : t.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{t.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {panelTab === "alerts" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {rules.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>알림이 없습니다</div>
          ) : rules.map((r, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: r.priority === "urgent" ? "var(--danger)" : r.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{r.action}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
