"use client";

import { useState, useMemo } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { AdStrategyAction, AdWeeklyPlan } from "@kiditem/shared";

interface AdSidePanelProps {
  rules: AdStrategyAction[];
  strategy: AdWeeklyPlan | null;
}

function actionName(action: AdStrategyAction): string {
  return action.listing.channelName ?? action.listing.masterProduct.name;
}

function actionDetail(action: AdStrategyAction): string {
  const current = action.currentValue == null ? "" : `현재 ${action.currentValue}`;
  const proposed = action.proposedValue == null ? "" : `→ ${action.proposedValue}`;
  const values = [current, proposed].filter(Boolean).join(" ");
  return values ? `${action.reason} (${values})` : action.reason;
}

export default function AdSidePanel({ rules, strategy }: AdSidePanelProps) {
  const [panelTab, setPanelTab] = useState<"todos" | "alerts">("todos");

  const todos = useMemo(() => {
    const issues = strategy?.issues;
    const issueItems: { label: string; detail: string; priority: AdStrategyAction["priority"] }[] = [];

    if (issues) {
      if (issues.zeroConversion.length > 0) {
        issueItems.push({
          label: `전환 0 상품 ${issues.zeroConversion.length}개`,
          detail: "클릭만 발생, 전환 없는 광고 중단 검토",
          priority: "urgent",
        });
      }
      if (issues.lowRoas.length > 0) {
        issueItems.push({
          label: `저ROAS 상품 ${issues.lowRoas.length}개`,
          detail: "예산 축소 또는 입찰가 조정 필요",
          priority: "high",
        });
      }
      if (issues.highSpend.length > 0) {
        issueItems.push({
          label: `고비용 상품 ${issues.highSpend.length}개`,
          detail: "효율 점검 필요",
          priority: "medium",
        });
      }
    }

    const actionItems = (strategy?.actions ?? [])
      .filter((a) => a.priority === "urgent" || a.priority === "high")
      .map((a) => ({
        label: actionName(a).slice(0, 24),
        detail: actionDetail(a),
        priority: a.priority,
      }));

    return [...issueItems, ...actionItems].slice(0, 15);
  }, [strategy]);

  const todoCount = todos.length;
  const alertCount = rules.length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full" style={{ background: "#ffffff", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button
          onClick={() => setPanelTab("todos")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "todos" ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}
        >
          <Sparkles size={13} />
          할 일 {todoCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: panelTab === "todos" ? "#fff" : "var(--primary)", color: panelTab === "todos" ? "var(--primary)" : "#fff" }}>{todoCount}</span>}
        </button>
        <button
          onClick={() => setPanelTab("alerts")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "alerts" ? { background: "var(--danger)", color: "#fff" } : { color: "var(--text-tertiary)" }}
        >
          <AlertTriangle size={13} />
          알림 {alertCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white" style={{ background: "var(--danger)" }}>{alertCount}</span>}
        </button>
      </div>

      {panelTab === "todos" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>처리할 업무가 없습니다</div>
          ) : todos.map((t, i) => (
            <div key={`${t.label}-${i}`} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: t.priority === "urgent" ? "var(--danger)" : t.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</div>
                <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{t.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {panelTab === "alerts" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {rules.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>알림이 없습니다</div>
          ) : rules.map((r) => (
            <div key={`${r.listing.listingId}-${r.actionType}-${r.reason}`} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: r.priority === "urgent" ? "var(--danger)" : r.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{actionName(r)}</div>
                <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{r.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
