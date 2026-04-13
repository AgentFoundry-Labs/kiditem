"use client";

import { useState } from "react";
import {
  ChevronDown, AlertTriangle, Sparkles, Megaphone, Wallet,
  Download, FileSpreadsheet, Search, Target,
} from "lucide-react";
import type { AdWeeklyPlan, AdStrategyAction } from "@kiditem/shared";
import { exportCampaignXlsx } from "../lib/xlsx-export";
import type { RegisterCampaignPayload } from "../hooks/useAdOpsData";

type RuleItem = { name: string; grade: string | null; rule: string; action: string; priority: string; roas: number; spend: number };

interface StrategyContentProps {
  strategy: AdWeeklyPlan | null;
  rules: RuleItem[];
  totalBudget: number;
  budgetInput: string;
  expandedProduct: string | null;
  gradeFilter: Record<string, "all" | "existing" | "new" | "recommended">;
  gradeSearch: Record<string, string>;
  selectedGrade: string | null;
  onBudgetChange: (value: number, input: string) => void;
  onExpandProduct: (id: string | null) => void;
  onGradeFilter: (grade: string, filter: "all" | "existing" | "new" | "recommended") => void;
  onGradeSearch: (grade: string, search: string) => void;
  onSelectGrade: (grade: string | null) => void;
  onOpenRegisterModal: (payload: RegisterCampaignPayload) => void;
}

function ProductStrategyRow({ action: a, gradeBudget, gradeCount, color, expanded, onToggle, isNew, compact }: {
  action: AdStrategyAction; gradeBudget: number; gradeCount: number; color: string;
  expanded: boolean; onToggle: () => void; isNew?: boolean; compact?: boolean;
}) {
  const productBudget = gradeCount > 0 ? Math.round(gradeBudget / gradeCount) : 0;
  const recBudget = a.recommendedDailyBudget > 0 ? a.recommendedDailyBudget : productBudget;
  const sk = a.suggestedKeywords;
  const px = compact ? "px-3" : "px-5";

  return (
    <div className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
      <button onClick={onToggle} className={`w-full text-left ${px} py-2.5`}>
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isNew && <span className="shrink-0 px-1 py-px rounded text-[8px] font-bold text-white" style={{ background: "#6366f1" }}>N</span>}
            <span className={`${compact ? "text-[11px]" : "text-[13px]"} font-bold truncate`} style={{ color: "var(--text-primary)" }}>{a.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`font-black tabular-nums ${compact ? "text-[12px]" : "text-[15px]"} ${a.currentRoas >= 300 ? "text-emerald-600" : a.currentRoas >= 100 ? "text-amber-600" : a.currentRoas > 0 ? "text-red-500" : ""}`} style={a.currentRoas === 0 ? { color: "var(--text-quaternary)" } : {}}>
              {a.currentRoas > 0 ? `${a.currentRoas}%` : "-"}
            </span>
            <ChevronDown size={11} className={`transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: "var(--text-quaternary)" }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          <span>{recBudget.toLocaleString()}원/일</span>
          <span>·</span>
          <span>입찰 {a.maxBidPrice > 0 ? `${a.maxBidPrice.toLocaleString()}원` : "-"}</span>
          <span>·</span>
          <span className={`font-bold ${a.actionPriority === "urgent" ? "text-red-600" : a.actionPriority === "high" ? "text-orange-600" : ""}`}>
            {a.actionPriority === "urgent" ? "긴급" : a.actionPriority === "high" ? "높음" : a.actionPriority === "medium" ? "보통" : "낮음"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className={`${px} pb-3 space-y-2`}>
          <div className="rounded-lg p-2.5" style={{ background: `${color}06`, border: `1px solid ${color}18` }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Target size={11} style={{ color }} />
              <span className="text-[9px] font-bold uppercase" style={{ color }}>캠페인 전략</span>
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.campaignStrategy}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{a.recommendedAction}</div>
          </div>

          <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-1.5">
              <Search size={10} style={{ color: "var(--text-secondary)" }} />
              <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>키워드 전략</span>
            </div>

            {a.keywords && a.keywords.length > 0 && (
              <div>
                <div className="text-[9px] font-semibold mb-0.5" style={{ color: "var(--text-tertiary)" }}>운영 중</div>
                <div className="flex flex-wrap gap-0.5">
                  {a.keywords.slice(0, 6).map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-semibold" style={{ background: `${color}10`, color, border: `1px solid ${color}20` }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.main?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#dc262612", color: "#dc2626" }}>메인</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.main.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-bold" style={{ background: "#dc26260a", color: "#dc2626", border: "1px solid #dc262618" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.sub?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#2563eb12", color: "#2563eb" }}>서브</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.sub.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-semibold" style={{ background: "#2563eb08", color: "#2563eb", border: "1px solid #2563eb15" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.longtail?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#05966912", color: "#059669" }}>롱테일</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.longtail.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-medium" style={{ background: "#05966908", color: "#059669", border: "1px solid #05966912" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.negative?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#6b728010", color: "#6b7280" }}>제외</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.negative.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-medium line-through" style={{ background: "#f4f5f7", color: "#9ca3af" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const GRADE_CONFIGS = [
  { grade: "A", title: "핵심 상품 캠페인", subtitle: "공격적 확장 — 매출 상위 70%", budgetPct: 65, color: "#059669", headerGrad: "from-emerald-600 to-green-600", border: "border-emerald-300", ring: "ring-emerald-400", campaignType: "매출최적화 + 수동 병행", targetRoasLabel: "300~500%", bidGuide: { main: "800~1,000", sub: "500~700", longtail: "200~400" } },
  { grade: "B", title: "성장 후보 캠페인", subtitle: "최적화 집중 — 매출 70~90%", budgetPct: 25, color: "#f59e0b", headerGrad: "from-amber-500 to-yellow-500", border: "border-amber-300", ring: "ring-amber-400", campaignType: "수동 성과형 위주", targetRoasLabel: "300~480%", bidGuide: { main: "500~700", sub: "300~500", longtail: "100~300" } },
  { grade: "C", title: "정리/테스트 캠페인", subtitle: "손절 · 재구성 — 나머지", budgetPct: 10, color: "#ef4444", headerGrad: "from-red-500 to-pink-500", border: "border-red-300", ring: "ring-red-400", campaignType: "최소 테스트 or OFF", targetRoasLabel: "500%+", bidGuide: { main: "OFF", sub: "200~300", longtail: "100~200" } },
];

export default function StrategyContent({
  strategy,
  rules,
  totalBudget,
  budgetInput,
  expandedProduct,
  gradeFilter,
  gradeSearch,
  selectedGrade,
  onBudgetChange,
  onExpandProduct,
  onGradeFilter,
  onGradeSearch,
  onSelectGrade,
  onOpenRegisterModal,
}: StrategyContentProps) {
  const stratActions = strategy?.actions || [];

  return (
    <div className="space-y-4">
      {/* ═══ 예산 + 배분 — 한 줄 컴팩트 ═══ */}
      <div className="rounded-2xl px-5 py-3 flex items-center gap-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5 shrink-0">
          <Wallet size={16} style={{ color: "var(--primary)" }} />
          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>일예산</span>
          <div className="relative">
            <input
              type="text" value={budgetInput}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                const num = parseInt(raw) || 0;
                onBudgetChange(num, num.toLocaleString());
              }}
              className="w-32 text-right pr-8 pl-3 py-1.5 rounded-lg text-[15px] font-black tabular-nums"
              style={{ background: "var(--surface-sunken)", border: "1.5px solid var(--primary)", color: "var(--text-primary)" }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none" style={{ color: "var(--text-tertiary)" }}>원</span>
          </div>
        </div>
        <div className="flex-1 flex h-3 rounded-full overflow-hidden">
          <div style={{ width: "65%", background: "linear-gradient(90deg, #059669, #10b981)" }} />
          <div style={{ width: "25%", background: "linear-gradient(90deg, #f59e0b, #fbbf24)" }} />
          <div style={{ width: "10%", background: "linear-gradient(90deg, #ef4444, #f87171)" }} />
        </div>
        <div className="flex gap-3 text-[10px] font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />A {Math.round(totalBudget * 0.65).toLocaleString()}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />B {Math.round(totalBudget * 0.25).toLocaleString()}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />C {Math.round(totalBudget * 0.1).toLocaleString()}</span>
        </div>
        <button
          onClick={() => exportCampaignXlsx("all", strategy?.actions || [], totalBudget)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white shrink-0"
          style={{ background: "var(--primary)" }}
        >
          <Download size={12} /> XLSX
        </button>
      </div>

      {/* ═══ 2. ABC 캠페인 카드 ═══ */}
      <div className="grid grid-cols-3 gap-3">
        {GRADE_CONFIGS.map(cfg => {
          const isSelected = selectedGrade === cfg.grade;
          const allGradeActions = stratActions.filter(a => a.grade === cfg.grade);
          const existingActions = allGradeActions.filter(a => a.isExisting);
          const newActions = allGradeActions.filter(a => !a.isExisting);
          const gradeBudget = Math.round(totalBudget * cfg.budgetPct / 100);
          const urgentGradeCount = allGradeActions.filter(a => a.actionPriority === "urgent").length;

          const recommendedActions = cfg.grade === "C"
            ? allGradeActions.filter(a => a.isExisting || a.actionPriority === "urgent" || a.actionPriority === "high" || a.currentRoas > 0)
            : [];

          const filter = gradeFilter[cfg.grade] || "all";
          const search = (gradeSearch[cfg.grade] || "").toLowerCase();
          let filteredActions = filter === "existing" ? existingActions
            : filter === "new" ? newActions
            : filter === "recommended" ? recommendedActions
            : allGradeActions;
          if (search) filteredActions = filteredActions.filter(a => a.name.toLowerCase().includes(search));
          const maxShow = cfg.grade === "C" ? 50 : 200;
          const hasMore = filteredActions.length > maxShow;
          const displayActions = filteredActions.slice(0, maxShow);

          return (
            <div key={cfg.grade} className={`rounded-2xl overflow-hidden border-2 ${cfg.border} transition-all flex flex-col ${isSelected ? `ring-2 ${cfg.ring} shadow-xl` : "hover:shadow-lg"}`}>
              <button onClick={() => onSelectGrade(isSelected ? null : cfg.grade)} className={`w-full text-left bg-gradient-to-r ${cfg.headerGrad} px-4 py-3`}>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg font-black text-white">{cfg.grade}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-white leading-tight truncate">{cfg.title}</div>
                    <div className="text-[12px] text-white/60 truncate">{cfg.subtitle}</div>
                  </div>
                  <ChevronDown size={15} className={`text-white/60 transition-transform shrink-0 ${isSelected ? "rotate-180" : ""}`} />
                </div>
                <div className="text-xl font-black text-white tabular-nums mb-1.5">{gradeBudget.toLocaleString()}<span className="text-[13px] font-semibold text-white/50 ml-1">원/일</span></div>
                <div className="flex flex-wrap items-center gap-1">
                  {urgentGradeCount > 0 && <span className="px-1.5 py-0.5 bg-red-500/80 rounded text-[11px] font-bold text-white">긴급 {urgentGradeCount}</span>}
                  <span className="px-1.5 py-0.5 bg-white/20 rounded text-[11px] font-bold text-white">기존 {existingActions.length}</span>
                  <span className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] font-bold text-white/70">신규 {newActions.length}</span>
                </div>
              </button>

              <div className="px-4 py-3 space-y-2" style={{ background: "var(--card-bg)", borderBottom: isSelected ? "1px solid var(--border-subtle)" : "none" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>캠페인 유형</div>
                    <div className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{cfg.campaignType}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>목표 ROAS</div>
                    <div className="text-[17px] font-black" style={{ color: cfg.color }}>{cfg.targetRoasLabel}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: `${cfg.color}15`, color: cfg.color }}>메인 {cfg.bidGuide.main}원</span>
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>서브 {cfg.bidGuide.sub}원</span>
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>롱테일 {cfg.bidGuide.longtail}원</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); exportCampaignXlsx(cfg.grade, allGradeActions, gradeBudget); }}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
                  style={{ background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}25` }}
                >
                  <FileSpreadsheet size={13} /> XLSX 내보내기
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const validBids = allGradeActions.filter(a => a.maxBidPrice > 0).map(a => a.maxBidPrice);
                    const smartBid = validBids.length > 0
                      ? Math.round(validBids.reduce((s, b) => s + b, 0) / validBids.length)
                      : (cfg.grade === "A" ? 800 : cfg.grade === "B" ? 500 : 300);
                    const targetRoas = allGradeActions[0]?.targetRoas
                      || parseInt(cfg.targetRoasLabel.match(/\d+/)?.[0] || "350");
                    const avgRoas = allGradeActions.reduce((s, a) => s + a.currentRoas, 0) / (allGradeActions.length || 1);
                    const opMode = avgRoas >= 300 && cfg.grade === "A" ? "자동운영_매출최적화" : "직접입력";
                    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                    const productsForCampaign = allGradeActions
                      .filter(a => a.action !== "stop")
                      .sort((a, b) => (priorityOrder[a.actionPriority] ?? 2) - (priorityOrder[b.actionPriority] ?? 2))
                      .slice(0, 20);
                    const allKws = allGradeActions
                      .flatMap(a => [...(a.suggestedKeywords?.main || []), ...(a.keywords || [])])
                      .filter((k, i, arr) => k && arr.indexOf(k) === i)
                      .slice(0, 10)
                      .map(kw => ({ keyword: kw, bidPrice: smartBid || 100 }));
                    onOpenRegisterModal({
                      grade: cfg.grade,
                      color: cfg.color,
                      campaignName: `${cfg.grade}등급_캠페인`,
                      adGroupName: `${cfg.grade}등급_그룹`,
                      dailyBudget: gradeBudget,
                      operationMode: opMode,
                      smartTargetingBid: smartBid,
                      nonSearchBid: 100,
                      targetRoas,
                      keywords: allKws,
                      products: productsForCampaign.map(a => ({ productId: a.productId, productName: a.name })),
                    });
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
                  style={{ background: cfg.color, color: "#fff" }}
                >
                  <Megaphone size={13} /> 광고 등록
                </button>
              </div>

              {isSelected && (
                <>
                  <div className="px-3 py-2 flex flex-col gap-2" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div className="flex rounded-md p-0.5" style={{ background: "var(--surface-sunken)" }}>
                      {([
                        { key: "all" as const, label: `전체 ${allGradeActions.length}` },
                        { key: "existing" as const, label: `기존 ${existingActions.length}` },
                        { key: "new" as const, label: `신규 ${newActions.length}` },
                        ...(cfg.grade === "C" ? [{ key: "recommended" as const, label: `추천 ${recommendedActions.length}` }] : []),
                      ]).map(f => (
                        <button key={f.key}
                          onClick={(e) => { e.stopPropagation(); onGradeFilter(cfg.grade, f.key); }}
                          className="flex-1 px-1 py-1 text-[10px] font-semibold rounded transition-all text-center"
                          style={filter === f.key ? { background: cfg.color, color: "#fff" } : { color: "var(--text-tertiary)" }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
                      <input
                        type="text" placeholder="검색..."
                        value={gradeSearch[cfg.grade] || ""}
                        onChange={e => onGradeSearch(cfg.grade, e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 rounded-md text-[11px]"
                        style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="max-h-[500px] overflow-y-auto flex-1" style={{ background: "var(--card-bg)" }}>
                    {displayActions.length === 0 ? (
                      <div className="p-4 text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        {search ? "검색 결과 없음" : "해당 상품 없음"}
                      </div>
                    ) : (
                      <div>
                        {filter === "all" && existingActions.length > 0 && newActions.length > 0 ? (
                          <>
                            <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: `${cfg.color}08`, borderBottom: "1px solid var(--border-subtle)" }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                              <span className="text-[10px] font-bold" style={{ color: cfg.color }}>기존 광고 상품 ({existingActions.length})</span>
                            </div>
                            <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                              {(search ? existingActions.filter(a => a.name.toLowerCase().includes(search)) : existingActions).slice(0, cfg.grade === "C" ? 30 : 100).map((a, i) => (
                                <ProductStrategyRow key={`e${i}`} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => onExpandProduct(expandedProduct === a.productId ? null : a.productId)} compact />
                              ))}
                            </div>
                            <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: "rgba(99,102,241,0.06)", borderTop: "2px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                              <Sparkles size={11} style={{ color: "#6366f1" }} />
                              <span className="text-[10px] font-bold" style={{ color: "#6366f1" }}>신규 편입 ({newActions.length})</span>
                            </div>
                            <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                              {(search ? newActions.filter(a => a.name.toLowerCase().includes(search)) : newActions).slice(0, cfg.grade === "C" ? 20 : 100).map((a, i) => (
                                <ProductStrategyRow key={`n${i}`} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => onExpandProduct(expandedProduct === a.productId ? null : a.productId)} isNew compact />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                            {displayActions.map((a, i) => (
                              <ProductStrategyRow key={i} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => onExpandProduct(expandedProduct === a.productId ? null : a.productId)} isNew={!a.isExisting} compact />
                            ))}
                          </div>
                        )}
                        {hasMore && (
                          <div className="px-3 py-2 text-center text-[10px]" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                            +{filteredActions.length - maxShow}개 더 있음
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ 3. 긴급 알림 바 ═══ */}
      {(() => {
        const urgentRules = rules.filter(r => r.priority === "urgent").slice(0, 5);
        const issues = strategy?.adIssues;
        const alerts: { label: string; detail: string; color: string }[] = [];
        if (issues?.zeroConversion) alerts.push({ label: `전환 0 상품 ${issues.zeroConversion}개`, detail: "키워드 OFF", color: "#dc2626" });
        if (issues?.cGradeHighTier) alerts.push({ label: `C등급 고광고 ${issues.cGradeHighTier}개`, detail: "예산 축소", color: "#f59e0b" });
        if (issues?.aGradeNoAd) alerts.push({ label: `A등급 미광고 ${issues.aGradeNoAd}개`, detail: "광고 시작", color: "#059669" });
        urgentRules.forEach(r => alerts.push({ label: r.name.substring(0, 25), detail: r.action.substring(0, 20), color: "#dc2626" }));
        if (alerts.length === 0) return null;
        return (
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 overflow-x-auto" style={{ background: "#dc262608", border: "1px solid #dc262615" }}>
            <div className="flex items-center gap-1.5 shrink-0">
              <AlertTriangle size={14} style={{ color: "#dc2626" }} />
              <span className="text-[11px] font-bold" style={{ color: "#dc2626" }}>긴급 {alerts.length}건</span>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {alerts.slice(0, 6).map((a, i) => (
                <span key={i} className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ background: `${a.color}10`, color: a.color, border: `1px solid ${a.color}20` }}>
                  {a.label}
                </span>
              ))}
            </div>
            <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-auto px-3 py-1 rounded-lg text-[10px] font-bold" style={{ background: "#dc2626", color: "#fff" }}>광고센터 →</a>
          </div>
        );
      })()}
    </div>
  );
}
