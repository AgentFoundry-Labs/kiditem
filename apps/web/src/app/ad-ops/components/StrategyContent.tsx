"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Megaphone,
  RefreshCw,
  Search,
  Target,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatKRW, formatNumber } from "@/lib/utils";
import { exportCampaignXlsx } from "../lib/xlsx-export";
import type {
  AdStrategyAction,
  AdWeeklyPlan,
  ChannelStateSignal,
} from "@kiditem/shared";
import type { RegisterCampaignPayload } from "../hooks/useAdOpsData";

interface GradeProduct {
  id: string;
  name: string;
  adTier: string | null;
  abcGrade: string | null;
  t14?: { revenue: number; salesQty: number; orders: number };
}

interface StrategyContentProps {
  strategy: AdWeeklyPlan | null;
  rules: AdStrategyAction[];
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
  onRefresh: () => void;
  isRefreshing: boolean;
}

const GRADE_CONFIGS = [
  { grade: "A", title: "핵심 상품 캠페인", subtitle: "공격적 확장 — 매출 상위 후보", budgetPct: 65, color: "#059669", headerBg: "bg-emerald-600", border: "border-emerald-300", campaignType: "매출최적화 + 수동 병행", targetRoasLabel: "300~500%", bidGuide: { main: "800~1,000", sub: "500~700", longtail: "200~400" } },
  { grade: "B", title: "성장 후보 캠페인", subtitle: "최적화 집중 — 검증 상품", budgetPct: 25, color: "#f59e0b", headerBg: "bg-amber-500", border: "border-amber-300", campaignType: "수동 성과형 위주", targetRoasLabel: "300~480%", bidGuide: { main: "500~700", sub: "300~500", longtail: "100~300" } },
  { grade: "C", title: "정리/테스트 캠페인", subtitle: "손절 · 재구성 — 저효율 상품", budgetPct: 10, color: "#ef4444", headerBg: "bg-red-500", border: "border-red-300", campaignType: "최소 테스트 or OFF", targetRoasLabel: "500%+", bidGuide: { main: "OFF", sub: "200~300", longtail: "100~200" } },
] as const;

type GradeCfg = (typeof GRADE_CONFIGS)[number];
const PAGE_SIZE = 10;

function actionName(action: AdStrategyAction): string {
  return action.listing.channelName ?? action.listing.masterProduct.name;
}

function actionListingId(action: AdStrategyAction): string {
  return action.listing.listingId;
}

function actionLabel(actionType: string): string {
  if (actionType === "increase") return "확대";
  if (actionType === "stop") return "중단";
  if (actionType === "decrease") return "축소";
  if (actionType === "maintain") return "유지";
  return actionType;
}

function actionTone(actionType: string): { bg: string; text: string } {
  if (actionType === "increase") return { bg: "#d1fae5", text: "#065f46" };
  if (actionType === "stop") return { bg: "#fee2e2", text: "#991b1b" };
  if (actionType === "decrease") return { bg: "#fef3c7", text: "#92400e" };
  return { bg: "#eff6ff", text: "#1e40af" };
}

function priorityLabel(priority: AdStrategyAction["priority"]): string {
  if (priority === "urgent") return "긴급";
  if (priority === "high") return "높음";
  if (priority === "medium") return "보통";
  return "낮음";
}

function recommendedBudget(action: AdStrategyAction, fallbackBudget: number): number {
  if (action.proposedValue && action.proposedValue > 1000) return action.proposedValue;
  return fallbackBudget;
}

function ChannelStateChips({ state }: { state: ChannelStateSignal }) {
  const chips: { label: string; tone: "danger" | "warn" | "neutral" }[] = [];

  if (state.isOfferWinner === true) {
    chips.push({ label: "아이템위너", tone: "neutral" });
  } else if (state.isOfferWinner === false) {
    chips.push({
      label: state.winnerGapPrice != null
        ? `아이템위너 아님 · 차이 ${formatNumber(state.winnerGapPrice)}원`
        : "아이템위너 아님",
      tone: "danger",
    });
  }
  if (state.exposureStatus && state.exposureStatus.toLowerCase() !== "active") {
    chips.push({ label: `노출 ${state.exposureStatus}`, tone: "warn" });
  }
  if (state.saleStatus && state.saleStatus.toLowerCase() !== "active") {
    chips.push({ label: `판매 ${state.saleStatus}`, tone: "warn" });
  }
  if (state.primaryOption?.stockQty === 0) {
    chips.push({ label: "옵션 재고 0", tone: "danger" });
  }
  if (chips.length === 0) chips.push({ label: "채널 관측", tone: "neutral" });

  const toneStyle = {
    danger: { background: "var(--danger-subtle)", color: "var(--danger)" },
    warn: { background: "var(--warning-soft)", color: "var(--warning)" },
    neutral: { background: "var(--surface-sunken)", color: "var(--text-secondary)" },
  } as const;

  return (
    <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>
          채널 상태 ({state.channel})
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          {state.businessDate} 관측 · n={state.sampleCount}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <span key={chip.label} className="px-1.5 py-px rounded text-[10px] font-semibold" style={toneStyle[chip.tone]}>
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductStrategyRow({
  action,
  gradeBudget,
  gradeCount,
  color,
  expanded,
  onToggle,
}: {
  action: AdStrategyAction;
  gradeBudget: number;
  gradeCount: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const productBudget = gradeCount > 0 ? Math.round(gradeBudget / gradeCount) : 0;
  const recBudget = recommendedBudget(action, productBudget);
  const tone = actionTone(action.actionType);

  return (
    <div className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
      <button onClick={onToggle} className="w-full text-left px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{actionName(action)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-bold" style={{ background: tone.bg, color: tone.text }}>
              {actionLabel(action.actionType)}
            </span>
            {action.currentValue != null && (
              <span className="font-black tabular-nums text-[15px]" style={{ color: action.currentValue >= 300 ? "#059669" : action.currentValue >= 100 ? "#d97706" : "#ef4444" }}>
                {action.currentValue}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          <span>{formatNumber(recBudget)}원/일</span>
          <span>·</span>
          <span className={action.priority === "urgent" ? "font-bold text-red-600" : action.priority === "high" ? "font-bold text-orange-600" : "font-bold"}>
            {priorityLabel(action.priority)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {action.channelState && <ChannelStateChips state={action.channelState} />}
          <div className="rounded-lg p-2.5" style={{ background: `${color}06`, border: `1px solid ${color}18` }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Target size={11} style={{ color }} />
              <span className="text-[9px] font-bold uppercase" style={{ color }}>추천 근거</span>
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{action.reason}</div>
            {action.proposedValue != null && (
              <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                제안값: {formatNumber(action.proposedValue)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GradeCardPanel({
  cfg,
  gradeActions,
  gradeBudget,
  expandedProduct,
  onExpandProduct,
  onOpenRegisterModal,
}: {
  cfg: GradeCfg;
  gradeActions: AdStrategyAction[];
  gradeBudget: number;
  expandedProduct: string | null;
  onExpandProduct: (id: string | null) => void;
  onOpenRegisterModal: (payload: RegisterCampaignPayload) => void;
}) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "ad" | "noad">("all");
  const [search, setSearch] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.products.list({ grade: cfg.grade, limit: "200" }),
    queryFn: () =>
      apiClient
        .get<{ items: GradeProduct[] }>(`/api/products?grade=${cfg.grade}&limit=200`)
        .then((r) => r.items),
  });

  const adProducts = products.filter((p) => p.adTier);
  const noAdProducts = products.filter((p) => !p.adTier);
  const filteredProducts = (filter === "ad" ? adProducts : filter === "noad" ? noAdProducts : products)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredActions = filter === "noad"
    ? []
    : gradeActions.filter((a) => !search || actionName(a).toLowerCase().includes(search.toLowerCase()));
  const displayRows = [
    ...filteredActions.map((action) => ({ kind: "action" as const, action })),
    ...filteredProducts.map((product) => ({ kind: "product" as const, product })),
  ];
  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE);
  const paged = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const urgentCount = gradeActions.filter((a) => a.priority === "urgent").length;

  const openRegister = () => {
    const usableActions = gradeActions.filter((a) => a.actionType !== "stop").slice(0, 20);
    const smartBid = cfg.grade === "A" ? 800 : cfg.grade === "B" ? 500 : 300;
    onOpenRegisterModal({
      grade: cfg.grade,
      color: cfg.color,
      campaignName: `${cfg.grade}등급_캠페인`,
      adGroupName: `${cfg.grade}등급_그룹`,
      dailyBudget: gradeBudget,
      operationMode: cfg.grade === "A" ? "자동운영_매출최적화" : "직접입력",
      smartTargetingBid: smartBid,
      nonSearchBid: 100,
      targetRoas: parseInt(cfg.targetRoasLabel.match(/\d+/)?.[0] ?? "300", 10),
      keywords: [],
      products: usableActions.map((a) => ({
        productId: actionListingId(a),
        productName: actionName(a),
      })),
    });
  };

  return (
    <div className={`rounded-2xl overflow-hidden border-2 ${cfg.border} flex flex-col shadow-sm`}>
      <div className={`${cfg.headerBg} px-4 py-3`}>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-xl font-black text-white">{cfg.grade}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white leading-tight truncate">{cfg.title}</div>
            <div className="text-[12px] text-white/60 truncate">{cfg.subtitle}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black text-white tabular-nums">{products.length}<span className="text-[13px] font-normal ml-0.5">개</span></div>
            <div className="text-[11px] text-white/60">상품</div>
          </div>
        </div>
        <div className="text-xl font-black text-white tabular-nums mb-1.5">{formatNumber(gradeBudget)}<span className="text-[13px] font-semibold text-white/50 ml-1">원/일</span></div>
        <div className="flex flex-wrap items-center gap-1">
          {urgentCount > 0 && <span className="px-1.5 py-0.5 bg-red-500/80 rounded text-[11px] font-bold text-white">긴급 {urgentCount}</span>}
          <span className="px-1.5 py-0.5 bg-white/20 rounded text-[11px] font-bold text-white">광고중 {adProducts.length}</span>
          <span className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] font-bold text-white/70">추천 {gradeActions.length}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2 border-b" style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}>
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
        <div className="flex gap-2">
          <button
            onClick={() => exportCampaignXlsx(cfg.grade, gradeActions, gradeBudget)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
            style={{ background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}25` }}
          >
            <FileSpreadsheet size={13} /> XLSX
          </button>
          <button
            onClick={openRegister}
            disabled={gradeActions.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md disabled:opacity-50"
            style={{ background: cfg.color, color: "#fff" }}
          >
            <Megaphone size={13} /> 광고 등록
          </button>
        </div>
      </div>

      <div className="px-3 py-2 flex flex-col gap-2 border-b" style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}>
        <div className="flex rounded-md p-0.5" style={{ background: "var(--surface-sunken)" }}>
          {([
            { key: "all" as const, label: `전체 ${products.length}` },
            { key: "ad" as const, label: `광고중 ${adProducts.length}` },
            { key: "noad" as const, label: `미광고 ${noAdProducts.length}` },
          ]).map((item) => (
            <button
              key={item.key}
              onClick={() => { setFilter(item.key); setPage(0); }}
              className="flex-1 px-1 py-1 text-[10px] font-semibold rounded transition-all text-center"
              style={filter === item.key ? { background: cfg.color, color: "#fff" } : { color: "var(--text-tertiary)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
          <input
            type="text"
            placeholder="상품명 검색..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-7 pr-2 py-1.5 rounded-md text-[12px]"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />
        </div>
      </div>

      <div style={{ background: "var(--card-bg)" }}>
        {paged.length === 0 ? (
          <div className="p-4 text-center text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {search ? "검색 결과 없음" : "상품 없음"}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {paged.map((row) => {
              if (row.kind === "action") {
                const { action } = row;
                return (
                  <ProductStrategyRow
                    key={`action-${action.listing.listingId}-${action.actionType}`}
                    action={action}
                    gradeBudget={gradeBudget}
                    gradeCount={gradeActions.length || 1}
                    color={cfg.color}
                    expanded={expandedProduct === action.listing.listingId}
                    onToggle={() => onExpandProduct(expandedProduct === action.listing.listingId ? null : action.listing.listingId)}
                  />
                );
              }
              const { product: p } = row;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                    {p.t14 && p.t14.revenue > 0 && (
                      <div className="text-[12px] tabular-nums mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        14일 매출 {formatKRW(p.t14.revenue)}원
                      </div>
                    )}
                  </div>
                  {p.adTier ? (
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-bold" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      광고중 {p.adTier}
                    </span>
                  ) : (
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-bold" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
                      추천 없음
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-[13px] font-semibold disabled:opacity-30 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={15} /> 이전
          </button>
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, displayRows.length)} / {displayRows.length}개
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 text-[13px] font-semibold disabled:opacity-30 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            다음 <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function StrategyContent({
  strategy,
  rules,
  totalBudget,
  budgetInput,
  expandedProduct,
  onBudgetChange,
  onExpandProduct,
  onOpenRegisterModal,
  onRefresh,
  isRefreshing,
}: StrategyContentProps) {
  const actions = strategy?.actions ?? [];
  const urgentRules = rules.filter((r) => r.priority === "urgent").slice(0, 5);
  const issueSummary = strategy?.issues;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl px-5 py-3 flex items-center gap-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5 shrink-0">
          <Wallet size={16} style={{ color: "var(--primary)" }} />
          <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>일예산</span>
          <div className="relative">
            <input
              type="text"
              value={budgetInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                const num = parseInt(raw, 10) || 0;
                onBudgetChange(num, formatNumber(num));
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
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />A {formatNumber(Math.round(totalBudget * 0.65))}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />B {formatNumber(Math.round(totalBudget * 0.25))}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />C {formatNumber(Math.round(totalBudget * 0.1))}</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 disabled:opacity-60"
          style={{ background: "#7c3aed", color: "#fff" }}
        >
          <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
          {isRefreshing ? "새로고침 중..." : "전략 새로고침"}
        </button>
        <button
          onClick={() => exportCampaignXlsx("all", actions, totalBudget)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white shrink-0"
          style={{ background: "var(--primary)" }}
        >
          <Download size={12} /> XLSX
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {GRADE_CONFIGS.map((cfg) => {
          const gradeActions = actions.filter((a) => a.grade === cfg.grade);
          const gradeBudget = Math.round((totalBudget * cfg.budgetPct) / 100);

          return (
            <GradeCardPanel
              key={cfg.grade}
              cfg={cfg}
              gradeActions={gradeActions}
              gradeBudget={gradeBudget}
              expandedProduct={expandedProduct}
              onExpandProduct={onExpandProduct}
              onOpenRegisterModal={onOpenRegisterModal}
            />
          );
        })}
      </div>

      {(() => {
        const alerts: { label: string; detail: string; color: string }[] = [];
        if (issueSummary?.zeroConversion.length) alerts.push({ label: `전환 0 상품 ${issueSummary.zeroConversion.length}개`, detail: "키워드 OFF", color: "#dc2626" });
        if (issueSummary?.lowRoas.length) alerts.push({ label: `저ROAS ${issueSummary.lowRoas.length}개`, detail: "예산 축소", color: "#f59e0b" });
        if (issueSummary?.highSpend.length) alerts.push({ label: `고비용 ${issueSummary.highSpend.length}개`, detail: "효율 점검", color: "#059669" });
        urgentRules.forEach((r) => alerts.push({ label: actionName(r).slice(0, 25), detail: r.actionType, color: "#dc2626" }));
        if (alerts.length === 0) return null;
        return (
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 overflow-x-auto" style={{ background: "#dc262608", border: "1px solid #dc262615" }}>
            <div className="flex items-center gap-1.5 shrink-0">
              <AlertTriangle size={14} style={{ color: "#dc2626" }} />
              <span className="text-[11px] font-bold" style={{ color: "#dc2626" }}>긴급/점검 {alerts.length}건</span>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {alerts.slice(0, 6).map((alert) => (
                <span key={`${alert.label}-${alert.detail}`} className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ background: `${alert.color}10`, color: alert.color, border: `1px solid ${alert.color}20` }}>
                  {alert.label}
                </span>
              ))}
            </div>
            <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-auto px-3 py-1 rounded-lg text-[10px] font-bold" style={{ background: "#dc2626", color: "#fff" }}>광고센터 →</a>
          </div>
        );
      })()}

      <div className="rounded-xl px-4 py-3 text-xs flex items-center gap-2" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
        <ChevronDown size={14} />
        AI agent 실행/결과 병합은 후속 이슈로 분리했습니다. 현재 화면은 daily fact 기반 규칙 계산과 채널 상태 근거만 표시합니다.
      </div>
    </div>
  );
}
