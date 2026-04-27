"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, AlertTriangle, Megaphone, Wallet,
  Download, FileSpreadsheet, Search, Target, Sparkles, Loader2,
} from "lucide-react";
import Link from "next/link";
import type {
  AdWeeklyPlan,
  AdStrategyAction,
  ChannelStateSignal,
} from "@kiditem/shared";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatKRW, formatNumber } from "@/lib/utils";
import { exportCampaignXlsx } from "../lib/xlsx-export";
import type { RegisterCampaignPayload } from "../hooks/useAdOpsData";

interface GradeProduct {
  id: string;
  name: string;
  adTier: string | null;
  coupangProductId: string | null;
  abcGrade: string | null;
  t14?: { revenue: number; salesQty: number; orders: number };
}

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
  onAiRefresh: () => void;
  isAiRefreshing: boolean;
}

/**
 * Wave C4 — channel state evidence chips. Read-only — surfaces signals from
 * the latest `ChannelListingDailySnapshot` (+ primary option daily) so the
 * reviewer sees product-state context behind a recommendation. Falls back to
 * a single "관측" chip when no specific adverse signal is present, so users
 * still see "we have a snapshot, dated X" instead of silence.
 */
function ChannelStateChips({ state }: { state: ChannelStateSignal }) {
  const chips: { label: string; tone: "danger" | "warn" | "neutral" }[] = [];

  if (state.isOfferWinner === true) {
    chips.push({ label: "아이템위너", tone: "neutral" });
  } else if (state.isOfferWinner === false) {
    if (state.winnerGapPrice != null) {
      chips.push({
        label: `아이템위너 아님 · 차이 ${state.winnerGapPrice.toLocaleString()}원`,
        tone: "danger",
      });
    } else {
      chips.push({ label: "아이템위너 아님", tone: "danger" });
    }
  }

  const isAdverse = (value: string | null): boolean =>
    value != null && value.length > 0 && value.toLowerCase() !== "active";
  if (isAdverse(state.exposureStatus)) {
    chips.push({ label: `노출 ${state.exposureStatus}`, tone: "warn" });
  }
  if (isAdverse(state.saleStatus)) {
    chips.push({ label: `판매 ${state.saleStatus}`, tone: "warn" });
  }

  const optStock = state.primaryOption?.stockQty;
  if (optStock != null) {
    if (optStock === 0) {
      chips.push({ label: "옵션 재고 0", tone: "danger" });
    } else if (optStock < 10) {
      chips.push({ label: `옵션 재고 ${optStock}`, tone: "warn" });
    }
  }

  if (chips.length === 0) {
    // No explicit positive OR adverse signal observed in this snapshot.
    // Per Wave C4 review: don't label unknown state as "양호" (healthy) —
    // present the snapshot honestly as observed-without-additional-signal so
    // reviewers don't read missing evidence as a verified clean bill.
    chips.push({ label: "추가 신호 없음", tone: "neutral" });
  }

  const toneStyles = (tone: "danger" | "warn" | "neutral") => {
    if (tone === "danger") {
      return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
    }
    if (tone === "warn") {
      return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
    }
    return {
      background: "var(--surface-sunken)",
      color: "var(--text-secondary)",
      border: "1px solid var(--border-subtle)",
    };
  };

  return (
    <div
      className="rounded-lg p-2.5 space-y-1.5"
      style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>
          채널 상태 ({state.channel})
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          {state.businessDate} 관측 · n={state.sampleCount}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c, i) => (
          <span
            key={i}
            className="px-1.5 py-px rounded text-[10px] font-semibold"
            style={toneStyles(c.tone)}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductStrategyRow({ action: a, gradeBudget, gradeCount, color, expanded, onToggle, isNew }: {
  action: AdStrategyAction; gradeBudget: number; gradeCount: number; color: string;
  expanded: boolean; onToggle: () => void; isNew?: boolean;
}) {
  const productBudget = gradeCount > 0 ? Math.round(gradeBudget / gradeCount) : 0;
  const recBudget = a.recommendedDailyBudget > 0 ? a.recommendedDailyBudget : productBudget;
  const sk = a.suggestedKeywords;

  return (
    <div className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
      <button onClick={onToggle} className="w-full text-left px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isNew && <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-bold text-white" style={{ background: "#6366f1" }}>N</span>}
            <span className="text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{a.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-bold" style={{
              background: a.action === 'increase' ? '#d1fae5' : a.action === 'stop' ? '#fee2e2' : a.action === 'decrease' ? '#fef3c7' : '#eff6ff',
              color: a.action === 'increase' ? '#065f46' : a.action === 'stop' ? '#991b1b' : a.action === 'decrease' ? '#92400e' : '#1e40af',
            }}>
              {a.action === 'increase' ? '확대' : a.action === 'stop' ? '중단' : a.action === 'decrease' ? '축소' : '유지'}
            </span>
            <span className={`font-black tabular-nums text-[15px] ${a.currentRoas >= 300 ? "text-emerald-600" : a.currentRoas >= 100 ? "text-amber-600" : a.currentRoas > 0 ? "text-red-500" : ""}`} style={a.currentRoas === 0 ? { color: "var(--text-quaternary)" } : {}}>
              {a.currentRoas > 0 ? `${a.currentRoas}%` : "-"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          <span>{formatNumber(recBudget)}원/일</span>
          <span>·</span>
          <span>입찰 {a.maxBidPrice > 0 ? `${formatNumber(a.maxBidPrice)}원` : "-"}</span>
          <span>·</span>
          <span className={`font-bold ${a.actionPriority === "urgent" ? "text-red-600" : a.actionPriority === "high" ? "text-orange-600" : ""}`}>
            {a.actionPriority === "urgent" ? "긴급" : a.actionPriority === "high" ? "높음" : a.actionPriority === "medium" ? "보통" : "낮음"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {(a.currentCtr > 0 || a.currentCvr > 0 || a.spend > 0) && (
            <div className="flex gap-3 text-[11px] px-1 mb-1" style={{ color: "var(--text-tertiary)" }}>
              {a.currentCtr > 0 && <span>CTR <b className="font-bold" style={{ color: "var(--text-secondary)" }}>{a.currentCtr.toFixed(2)}%</b></span>}
              {a.currentCvr > 0 && <span>CVR <b className="font-bold" style={{ color: "var(--text-secondary)" }}>{a.currentCvr.toFixed(2)}%</b></span>}
              {a.spend > 0 && <span>광고비 <b className="font-bold" style={{ color: "var(--text-secondary)" }}>{formatNumber(a.spend)}원</b></span>}
            </div>
          )}

          {/* Wave C4 — read-only product/option state evidence from latest
              channel daily snapshot. Only shown when the strategy backend
              returns `channelState` (snapshot exists for this listing). */}
          {a.channelState && <ChannelStateChips state={a.channelState} />}
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
  { grade: "A", title: "핵심 상품 캠페인", subtitle: "공격적 확장 — 매출 상위 70%", budgetPct: 65, color: "#059669", headerBg: "bg-emerald-600", border: "border-emerald-300", ring: "ring-emerald-400", campaignType: "매출최적화 + 수동 병행", targetRoasLabel: "300~500%", bidGuide: { main: "800~1,000", sub: "500~700", longtail: "200~400" } },
  { grade: "B", title: "성장 후보 캠페인", subtitle: "최적화 집중 — 매출 70~90%", budgetPct: 25, color: "#f59e0b", headerBg: "bg-amber-500", border: "border-amber-300", ring: "ring-amber-400", campaignType: "수동 성과형 위주", targetRoasLabel: "300~480%", bidGuide: { main: "500~700", sub: "300~500", longtail: "100~300" } },
  { grade: "C", title: "정리/테스트 캠페인", subtitle: "손절 · 재구성 — 나머지", budgetPct: 10, color: "#ef4444", headerBg: "bg-red-500", border: "border-red-300", ring: "ring-red-400", campaignType: "최소 테스트 or OFF", targetRoasLabel: "500%+", bidGuide: { main: "OFF", sub: "200~300", longtail: "100~200" } },
];

type GradeCfg = typeof GRADE_CONFIGS[number];

const PAGE_SIZE = 10;

function GradeCardPanel({
  cfg, allGradeActions, gradeBudget, urgentGradeCount,
  expandedProduct, onExpandProduct, onOpenRegisterModal,
  exportCampaignXlsx: exportXlsx,
}: {
  cfg: GradeCfg;
  allGradeActions: AdStrategyAction[];
  gradeBudget: number;
  urgentGradeCount: number;
  expandedProduct: string | null;
  onExpandProduct: (id: string | null) => void;
  onOpenRegisterModal: (payload: RegisterCampaignPayload) => void;
  exportCampaignXlsx: (grade: string, actions: AdStrategyAction[], budget: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [adFilter, setAdFilter] = useState<"all" | "ad" | "noad">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.products.list({ grade: cfg.grade, limit: "200" }),
    queryFn: () =>
      apiClient.get<{ items: GradeProduct[] }>(`/api/products?grade=${cfg.grade}&limit=200`)
        .then(r => r.items),
  });

  const adProducts = products.filter(p => p.adTier);
  const noAdProducts = products.filter(p => !p.adTier);

  const filtered = (adFilter === "ad" ? adProducts : adFilter === "noad" ? noAdProducts : products)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className={`rounded-2xl overflow-hidden border-2 ${cfg.border} flex flex-col shadow-sm`}>
      {/* 헤더 */}
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
          {urgentGradeCount > 0 && <span className="px-1.5 py-0.5 bg-red-500/80 rounded text-[11px] font-bold text-white">긴급 {urgentGradeCount}</span>}
          <span className="px-1.5 py-0.5 bg-white/20 rounded text-[11px] font-bold text-white">광고중 {adProducts.length}</span>
          <span className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] font-bold text-white/70">미광고 {noAdProducts.length}</span>
        </div>
      </div>

      {/* 캠페인 정보 + 액션 버튼 */}
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
            onClick={() => exportXlsx(cfg.grade, allGradeActions, gradeBudget)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
            style={{ background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}25` }}
          >
            <FileSpreadsheet size={13} /> XLSX
          </button>
          <button
            onClick={() => {
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
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
            style={{ background: cfg.color, color: "#fff" }}
          >
            <Megaphone size={13} /> 광고 등록
          </button>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div className="px-3 py-2 flex flex-col gap-2 border-b" style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}>
        <div className="flex rounded-md p-0.5" style={{ background: "var(--surface-sunken)" }}>
          {([
            { key: "all" as const, label: `전체 ${products.length}` },
            { key: "ad" as const, label: `광고중 ${adProducts.length}` },
            { key: "noad" as const, label: `미광고 ${noAdProducts.length}` },
          ]).map(f => (
            <button key={f.key}
              onClick={() => { setAdFilter(f.key); setPage(0); }}
              className="flex-1 px-1 py-1 text-[10px] font-semibold rounded transition-all text-center"
              style={adFilter === f.key ? { background: cfg.color, color: "#fff" } : { color: "var(--text-tertiary)" }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
          <input
            type="text" placeholder="상품명 검색..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-7 pr-2 py-1.5 rounded-md text-[12px]"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          />
        </div>
      </div>

      {/* 상품 목록 */}
      <div style={{ background: "var(--card-bg)" }}>
        {paged.length === 0 ? (
          <div className="p-4 text-center text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {search ? "검색 결과 없음" : "상품 없음"}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {paged.map((p) => {
              const action = allGradeActions.find(a => a.productId === p.id);
              if (action) {
                return (
                  <ProductStrategyRow
                    key={p.id}
                    action={action}
                    gradeBudget={gradeBudget}
                    gradeCount={allGradeActions.length || 1}
                    color={cfg.color}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                    isNew={!action.isExisting}
                  />
                );
              }
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
                    <Link href="/ads" className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                      광고 등록
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ background: "var(--card-bg)", borderColor: "var(--border-subtle)" }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-[13px] font-semibold disabled:opacity-30 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={15} /> 이전
          </button>
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}개
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
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
  gradeFilter,
  gradeSearch,
  selectedGrade,
  onBudgetChange,
  onExpandProduct,
  onGradeFilter,
  onGradeSearch,
  onSelectGrade,
  onOpenRegisterModal,
  onAiRefresh,
  isAiRefreshing,
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
          onClick={onAiRefresh}
          disabled={isAiRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 disabled:opacity-60"
          style={{ background: "#7c3aed", color: "#fff" }}
        >
          {isAiRefreshing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isAiRefreshing ? "AI 분석 중..." : "AI 전략 분석"}
        </button>
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
          const allGradeActions = stratActions.filter(a => a.grade === cfg.grade);
          const gradeBudget = Math.round(totalBudget * cfg.budgetPct / 100);
          const urgentGradeCount = allGradeActions.filter(a => a.actionPriority === "urgent").length;

          return (
            <GradeCardPanel
              key={cfg.grade}
              cfg={cfg}
              allGradeActions={allGradeActions}
              gradeBudget={gradeBudget}
              urgentGradeCount={urgentGradeCount}
              expandedProduct={expandedProduct}
              onExpandProduct={onExpandProduct}
              onOpenRegisterModal={onOpenRegisterModal}
              exportCampaignXlsx={exportCampaignXlsx}
            />
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
