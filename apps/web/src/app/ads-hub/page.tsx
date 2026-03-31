"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Megaphone, RefreshCw, TrendingUp, TrendingDown,
  ExternalLink, Check,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AdsListItem as AdProduct, AdsSummary as AdSummary } from '@kiditem/shared';
import { formatKRW, formatPercent, getGradeColor, getProfitColor } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

interface ActionItem {
  productId: string;
  productName: string;
  grade: string;
  tier: string | null;
  currentRoas: number;
  currentAdRate: number;
  recommendedAction: string;
  actionPriority: "urgent" | "high" | "medium" | "low";
  reason: string;
  maxBidPrice: number;
  recommendedDailyBudget: number;
}

const GRADE_TARGETS: Record<string, number> = { A: 80, B: 15, C: 5 };
const GRADE_LABELS: Record<string, string> = { A: "핵심상품", B: "성장상품", C: "정리대상" };

const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-red-100", text: "text-red-700", label: "긴급" },
  high: { bg: "bg-orange-100", text: "text-orange-700", label: "높음" },
  medium: { bg: "bg-blue-100", text: "text-blue-700", label: "보통" },
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "낮음" },
};

function buildActions(products: AdProduct[]): ActionItem[] {
  return products
    .map((p) => {
      let action = "유지";
      let priority: ActionItem["actionPriority"] = "low";
      let reason = "정상 운영 중";

      if (p.adRevenue === 0 && p.spend > 0) {
        action = "광고 매출 0원 — 즉시 중단";
        priority = "urgent";
        reason = `광고비 ₩${formatKRW(p.spend)} 지출, 매출 없음`;
      } else if (p.roas > 0 && p.roas < 200 && p.spend > 0) {
        action = `ROAS ${p.roas}% 위험 — 광고비 절감 또는 중단`;
        priority = "urgent";
        reason = `ROAS ${p.roas}%로 손실 구간`;
      } else if (p.profitRate < 0 && p.spend > 0) {
        action = "적자 상품 — 광고 중단 권고";
        priority = "urgent";
        reason = `이익률 ${p.profitRate}%, 광고비가 수익 초과`;
      } else if (p.adRate > 15) {
        action = "광고비율 과다 — 입찰가 조정";
        priority = "high";
        reason = `광고비율 ${p.adRate}% (기준: 15% 이하)`;
      } else if (p.grade === "C" && (p.adTier === "1차" || p.adTier === "2차")) {
        action = "C등급 고티어 — 티어 하향 필요";
        priority = "high";
        reason = `${p.grade}등급 상품에 ${p.adTier} 배정`;
      } else if (p.roas >= 200 && p.roas < 300) {
        action = "ROAS 개선 필요 — 키워드 최적화";
        priority = "medium";
        reason = `ROAS ${p.roas}% (목표: 300% 이상)`;
      } else if (p.roas >= 300) {
        action = "유지";
        priority = "low";
        reason = `ROAS ${p.roas}%, 정상 운영`;
      }

      const avgSpend = p.spend > 0 ? p.spend / 30 : 0;
      const targetRoas = p.grade === "A" ? 300 : p.grade === "B" ? 400 : 500;
      const maxBid = avgSpend > 0 ? Math.round(avgSpend * (targetRoas / Math.max(p.roas, 1))) : 0;

      return {
        productId: p.id,
        productName: p.name,
        grade: p.grade,
        tier: p.adTier,
        currentRoas: p.roas,
        currentAdRate: p.adRate,
        recommendedAction: action,
        actionPriority: priority,
        reason,
        maxBidPrice: Math.min(maxBid, 5000),
        recommendedDailyBudget: Math.round(avgSpend * 0.8),
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.actionPriority] ?? 4) - (order[b.actionPriority] ?? 4);
    });
}

function getStatusBadge(p: AdProduct): { label: string; cls: string } {
  if (p.profitRate < 0) return { label: "적자", cls: "bg-red-100 text-red-700" };
  if (p.adRate > 15) return { label: "점검필요", cls: "bg-orange-100 text-orange-700" };
  if (p.roas > 0 && p.roas < 200) return { label: "효율낮음", cls: "bg-yellow-100 text-yellow-700" };
  return { label: "정상", cls: "bg-green-100 text-green-700" };
}

export default function AdsHubPage() {
  const [adData, setAdData] = useState<{ products: AdProduct[]; summary: AdSummary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeGrade, setActiveGrade] = useState<"A" | "B" | "C">("A");
  const [activeTab, setActiveTab] = useState<"overview" | "strategy">("overview");
  const [tierUpdating, setTierUpdating] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    apiClient.get<{ products: AdProduct[]; summary: AdSummary }>('/api/ads/hub')
      .then((data) => setAdData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const changeTier = async (productId: string, newTier: string) => {
    setTierUpdating(productId);
    try {
      await apiClient.patch(`/api/ads/${productId}/tier`, { adTier: newTier });
      setAdData((prev) =>
        prev
          ? {
              ...prev,
              products: prev.products.map((p) =>
                p.id === productId ? { ...p, adTier: newTier === "OFF" ? null : newTier } : p
              ),
            }
          : prev
      );
    } catch { /* noop */ } finally {
      setTierUpdating(null);
    }
  };

  const gradeProducts = useMemo(() => {
    if (!adData) return [];
    return adData.products.filter((p) => p.grade === activeGrade).sort((a, b) => b.revenue - a.revenue);
  }, [adData, activeGrade]);

  const gradeStats = useMemo(() => {
    const empty = { count: 0, revenue: 0, spend: 0 };
    if (!adData) return { A: { ...empty }, B: { ...empty }, C: { ...empty } };
    const stats: Record<string, { count: number; revenue: number; spend: number }> = {
      A: { ...empty },
      B: { ...empty },
      C: { ...empty },
    };
    adData.products.forEach((p) => {
      if (stats[p.grade]) {
        stats[p.grade].count++;
        stats[p.grade].revenue += p.revenue;
        stats[p.grade].spend += p.spend;
      }
    });
    return stats;
  }, [adData]);

  const gradeRoas = useMemo(() => {
    if (!adData) return { A: 0, B: 0, C: 0 };
    const r: Record<string, { spend: number; adRev: number }> = {
      A: { spend: 0, adRev: 0 },
      B: { spend: 0, adRev: 0 },
      C: { spend: 0, adRev: 0 },
    };
    adData.products.forEach((p) => {
      if (r[p.grade]) {
        r[p.grade].spend += p.spend;
        r[p.grade].adRev += p.adRevenue;
      }
    });
    return {
      A: r.A.spend > 0 ? Math.round((r.A.adRev / r.A.spend) * 100) : 0,
      B: r.B.spend > 0 ? Math.round((r.B.adRev / r.B.spend) * 100) : 0,
      C: r.C.spend > 0 ? Math.round((r.C.adRev / r.C.spend) * 100) : 0,
    };
  }, [adData]);

  const gradeProfitRate = useMemo(() => {
    if (!adData) return { A: 0, B: 0, C: 0 };
    const r: Record<string, { rev: number; profit: number }> = {
      A: { rev: 0, profit: 0 },
      B: { rev: 0, profit: 0 },
      C: { rev: 0, profit: 0 },
    };
    adData.products.forEach((p) => {
      if (r[p.grade]) {
        r[p.grade].rev += p.revenue;
        r[p.grade].profit += p.netProfit;
      }
    });
    return {
      A: r.A.rev > 0 ? Math.round((r.A.profit / r.A.rev) * 1000) / 10 : 0,
      B: r.B.rev > 0 ? Math.round((r.B.profit / r.B.rev) * 1000) / 10 : 0,
      C: r.C.rev > 0 ? Math.round((r.C.profit / r.C.rev) * 1000) / 10 : 0,
    };
  }, [adData]);

  const actions = useMemo(() => {
    if (!adData) return [];
    return buildActions(adData.products);
  }, [adData]);

  const monthlyTrendData = useMemo(() => {
    if (!adData) return [];
    const byMonth: Record<string, number> = {};
    adData.products.forEach((p) => {
      const key = "이번달";
      byMonth[key] = (byMonth[key] || 0) + p.spend;
    });
    return Object.entries(byMonth).map(([period, adCost]) => ({ period, adCost }));
  }, [adData]);

  if (loading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone size={20} className="text-blue-500" />
          <h1 className="text-lg font-bold">통합 광고 대시보드</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === "overview"
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-500"
              }`}
            >
              광고 현황
            </button>
            <button
              onClick={() => setActiveTab("strategy")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === "strategy"
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-500"
              }`}
            >
              전략 &amp; 분류
            </button>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors"
          >
            <RefreshCw size={12} /> 새로고침
          </button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <>
      <div className="grid grid-cols-3 gap-3">
            {(["A", "B", "C"] as const).map((g) => {
              const s = gradeStats[g];
              const spendPct = adData?.summary.gradeSpendPercent[g] ?? 0;
              const target = GRADE_TARGETS[g];
              const isOnTarget = Math.abs(spendPct - target) <= 10;
              return (
                <button
                  key={g}
                  onClick={() => setActiveGrade(g)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    activeGrade === g
                      ? "border-blue-400 bg-blue-50/50"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(g)}`}>
                      {g}등급
                    </span>
                    <span className="text-[10px] text-gray-400">{GRADE_LABELS[g]}</span>
                  </div>
                  <div className="text-lg font-bold">{s.count}개</div>
                  <div className="text-xs text-gray-500 mt-1">매출 ₩{formatKRW(s.revenue)}</div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-gray-400">광고 예산 배분</span>
                      <span className={isOnTarget ? "text-green-600" : "text-orange-500"}>
                        {spendPct}% / 목표 {target}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${
                          g === "A" ? "bg-green-400" : g === "B" ? "bg-yellow-400" : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(spendPct, 100)}%` }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-gray-800"
                        style={{ left: `${target}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(activeGrade)}`}>
                  {activeGrade}등급
                </span>
                <span className="text-sm font-medium">{GRADE_LABELS[activeGrade]} 광고 현황</span>
                <span className="text-xs text-gray-400">{gradeProducts.length}개 상품</span>
              </div>
              <a href="/ads" className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                전체보기 <ExternalLink size={10} />
              </a>
            </div>

            {gradeProducts.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">해당 등급의 광고 상품이 없습니다</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/50 text-gray-500">
                      <th className="text-left px-4 py-2 font-medium">상품명</th>
                      <th className="text-right px-3 py-2 font-medium">매출</th>
                      <th className="text-right px-3 py-2 font-medium">이익률</th>
                      <th className="text-right px-3 py-2 font-medium">광고비</th>
                      <th className="text-right px-3 py-2 font-medium">ROAS</th>
                      <th className="text-center px-3 py-2 font-medium">상태</th>
                      <th className="text-center px-3 py-2 font-medium">티어</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {gradeProducts.slice(0, 20).map((p) => {
                      const status = getStatusBadge(p);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="max-w-[200px] truncate font-medium text-gray-900">{p.name}</div>
                            <div className="text-[10px] text-gray-400">
                              {p.company} · {p.adTier || "미설정"}
                            </div>
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums">₩{formatKRW(p.revenue)}</td>
                          <td className={`text-right px-3 py-2.5 tabular-nums ${getProfitColor(p.profitRate)}`}>
                            {formatPercent(p.profitRate)}
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums">₩{formatKRW(p.spend)}</td>
                          <td
                            className={`text-right px-3 py-2.5 tabular-nums font-medium ${
                              p.roas >= 300 ? "text-green-600" : p.roas >= 200 ? "text-orange-500" : "text-red-500"
                            }`}
                          >
                            {p.roas}%
                          </td>
                          <td className="text-center px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="text-center px-3 py-2.5">
                            <select
                              value={p.adTier || "OFF"}
                              onChange={(e) => changeTier(p.id, e.target.value)}
                              disabled={tierUpdating === p.id}
                              className={`text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-white cursor-pointer focus:ring-1 focus:ring-blue-400 ${
                                tierUpdating === p.id ? "opacity-50" : ""
                              }`}
                            >
                              <option value="1차">1차</option>
                              <option value="2차">2차</option>
                              <option value="3차">3차</option>
                              <option value="OFF">OFF</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 mb-3">등급별 ROAS</div>
              <div className="space-y-2">
                {(["A", "B", "C"] as const).map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <span className={`w-5 text-center text-[10px] font-bold rounded ${getGradeColor(g)}`}>
                      {g}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          gradeRoas[g] >= 300
                            ? "bg-green-400"
                            : gradeRoas[g] >= 200
                              ? "bg-yellow-400"
                              : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(gradeRoas[g] / 5, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">{gradeRoas[g]}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 mb-2">월간 광고비 추이</div>
              {monthlyTrendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={monthlyTrendData}>
                    <XAxis dataKey="period" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
                      formatter={(v: unknown) => [`₩${formatKRW(Number(v))}`, "광고비"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="adCost"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.1}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[100px] flex items-center justify-center text-xs text-gray-300">
                  데이터 부족
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 mb-3">등급별 이익률</div>
              <div className="space-y-2">
                {(["A", "B", "C"] as const).map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <span className={`w-5 text-center text-[10px] font-bold rounded ${getGradeColor(g)}`}>
                      {g}
                    </span>
                    <div className="flex-1">
                      <div className={`text-sm font-bold tabular-nums ${getProfitColor(gradeProfitRate[g])}`}>
                        {gradeProfitRate[g]}%
                      </div>
                    </div>
                    {gradeProfitRate[g] > 0 ? (
                      <TrendingUp size={12} className="text-green-500" />
                    ) : (
                      <TrendingDown size={12} className="text-red-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Megaphone size={14} className="text-orange-500" />
                <span className="text-sm font-medium">주간 액션 플랜</span>
                <span className="text-xs text-gray-400">{actions.length}건</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500">
                    <th className="text-left px-4 py-2 font-medium">우선순위</th>
                    <th className="text-left px-3 py-2 font-medium">등급</th>
                    <th className="text-left px-3 py-2 font-medium">상품명</th>
                    <th className="text-left px-3 py-2 font-medium">추천 액션</th>
                    <th className="text-right px-3 py-2 font-medium">ROAS</th>
                    <th className="text-right px-3 py-2 font-medium">광고비율</th>
                    <th className="text-right px-3 py-2 font-medium">추천 입찰가</th>
                    <th className="text-right px-3 py-2 font-medium">추천 일예산</th>
                    <th className="text-left px-3 py-2 font-medium">사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {actions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        전략 데이터가 없습니다
                      </td>
                    </tr>
                  ) : (
                    actions.slice(0, 50).map((a, i) => {
                      const ps = PRIORITY_STYLE[a.actionPriority];
                      return (
                        <tr key={`${a.productId}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ps.bg} ${ps.text}`}>
                              {ps.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(a.grade)}`}>
                              {a.grade}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="max-w-[150px] truncate font-medium">{a.productName}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div
                              className={`max-w-[200px] truncate ${
                                a.actionPriority === "urgent"
                                  ? "text-red-600"
                                  : a.actionPriority === "high"
                                    ? "text-orange-600"
                                    : "text-blue-600"
                              }`}
                            >
                              {a.recommendedAction}
                            </div>
                          </td>
                          <td
                            className={`text-right px-3 py-2.5 tabular-nums ${
                              a.currentRoas >= 300
                                ? "text-green-600"
                                : a.currentRoas >= 200
                                  ? "text-orange-500"
                                  : "text-red-500"
                            }`}
                          >
                            {a.currentRoas}%
                          </td>
                          <td
                            className={`text-right px-3 py-2.5 tabular-nums ${
                              a.currentAdRate > 15 ? "text-red-500" : "text-gray-700"
                            }`}
                          >
                            {a.currentAdRate}%
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums">
                            ₩{formatKRW(a.maxBidPrice)}
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums">
                            ₩{formatKRW(a.recommendedDailyBudget)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="max-w-[200px] truncate text-[10px] text-gray-500">{a.reason}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Megaphone size={14} className="text-green-500" />
              <span className="text-sm font-medium">등급별 광고 전략 가이드</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  grade: "A",
                  title: "핵심상품",
                  color: "border-green-200 bg-green-50/30",
                  rules: [
                    "예산의 80%를 집중 투입",
                    "ROAS 300% 이상 유지",
                    "광고비율 12% 이내",
                    "1차 핵심 광고 운영",
                    "키워드 확장으로 노출 극대화",
                  ],
                },
                {
                  grade: "B",
                  title: "성장상품",
                  color: "border-yellow-200 bg-yellow-50/30",
                  rules: [
                    "예산의 15% 배분",
                    "ROAS 400% 이상 목표",
                    "광고비율 8% 이내",
                    "2차 성장 광고 운영",
                    "A등급 승급 가능성 모니터링",
                  ],
                },
                {
                  grade: "C",
                  title: "정리대상",
                  color: "border-red-200 bg-red-50/30",
                  rules: [
                    "예산의 5% 이하로 제한",
                    "ROAS 500% 미달 시 중단",
                    "광고비율 5% 이내",
                    "3차 테스트만 허용",
                    "적자 상품 즉시 광고 중단",
                  ],
                },
              ].map((item) => (
                <div key={item.grade} className={`rounded-lg border p-3 ${item.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(item.grade)}`}>
                      {item.grade}등급
                    </span>
                    <span className="text-xs font-medium">{item.title}</span>
                  </div>
                  <ul className="space-y-1">
                    {item.rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                        <Check size={10} className="shrink-0 mt-0.5 text-gray-400" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
