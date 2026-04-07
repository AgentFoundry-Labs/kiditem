"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AdsListItem as AdProduct, AdsSummary as AdSummary } from '@kiditem/shared';

import { Megaphone, TrendingDown, AlertTriangle, Download } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { AdsTable } from "./components/AdsTable";
import { CampaignList } from "./components/CampaignList";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { queryKeys } from "@/lib/query-keys";
import { ROAS_STATUS_COLOR, AD_RATE_STATUS_STYLE, AD_RATE_STATUS_TEXT_COLOR } from "./lib/status-colors";

export default function AdsPage() {
  const [filter, setFilter] = useState("all");

  const { data: rawData, isLoading: loading } = useQuery({
    queryKey: queryKeys.ads.list(),
    queryFn: () => apiClient.get<{ items?: AdProduct[]; products?: AdProduct[]; summary?: AdSummary }>('/api/ads'),
  });

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{
      roas: { thresholds: { excellent: number; warning: number; poor: number } };
      adRate: { thresholds: { warning: number; critical: number } };
    }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };
  const adRateT = adsConfig?.adRate?.thresholds ?? { warning: 15, critical: 20 };

  const { data: campaignData } = useQuery({
    queryKey: queryKeys.ads.campaigns(),
    queryFn: () => apiClient.get<{
      totalKpi: Record<string, number>;
      campaigns: Array<{
        campaignName: string; adSpend: number; adRevenue: number;
        impressions: number; clicks: number; ctr: number;
        conversions: number; roas: number; conversionRate: number;
        budget: number | null; todaySpend: number | null;
      }>;
    }>('/api/ads/campaigns'),
  });

  const products = useMemo(() => {
    if (!rawData) return [];
    return rawData.items || rawData.products || [];
  }, [rawData]);

  const summary = useMemo<AdSummary | null>(() => {
    if (!rawData) return null;
    if (rawData.summary) return rawData.summary;
    const items = rawData.items || rawData.products || [];
    const totalSpend = items.reduce((s, p) => s + p.spend, 0);
    const totalAdRevenue = items.reduce((s, p) => s + p.adRevenue, 0);
    const totalRevenue = items.reduce((s, p) => s + p.revenue, 0);
    const overallAdRate = totalRevenue > 0 ? Math.round((totalSpend / totalRevenue) * 1000) / 10 : 0;
    const overallRoas = totalSpend > 0 ? Math.round((totalAdRevenue / totalSpend) * 100) : 0;
    const highAdCount = items.filter((p) => p.adRateOverLimit).length;
    const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
    const tierSpend: Record<string, number> = {};
    for (const p of items) {
      gradeSpend[p.grade] = (gradeSpend[p.grade] || 0) + p.spend;
      const tier = p.adTier ?? 'none';
      tierSpend[tier] = (tierSpend[tier] || 0) + p.spend;
    }
    const gradeSpendPercent: Record<string, number> = {
      A: totalSpend > 0 ? Math.round((gradeSpend.A / totalSpend) * 100) : 0,
      B: totalSpend > 0 ? Math.round((gradeSpend.B / totalSpend) * 100) : 0,
      C: totalSpend > 0 ? Math.round((gradeSpend.C / totalSpend) * 100) : 0,
    };
    return {
      totalSpend, totalAdRevenue, totalRevenue, overallAdRate,
      overallRoas, highAdCount, gradeSpend, tierSpend, gradeSpendPercent,
      overallRoasStatus: overallRoas >= roasT.excellent ? 'excellent' as const : overallRoas >= roasT.warning ? 'good' as const : overallRoas >= roasT.poor ? 'warning' as const : 'poor' as const,
      overallAdRateStatus: overallAdRate <= adRateT.warning ? 'ok' as const : overallAdRate <= adRateT.critical ? 'warning' as const : 'critical' as const,
    };
  }, [rawData, roasT, adRateT]);

  const handleExcel = () => {
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        filtered.map((p) => ({
          등급: p.grade, 광고등급: p.adTier, 상품명: p.name, 회사: p.company,
          광고비: p.spend, 광고매출: p.adRevenue, ROAS: p.roas,
          "CTR(%)": p.ctr, "전환율(%)": p.convRate, "ACoS(%)": p.acos,
          "광고비율(%)": p.adRate, 매출: p.revenue, 순이익: p.netProfit,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "광고현황");
      XLSX.writeFile(wb, `광고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  if (loading || !summary) return <PageSkeleton variant="table" />;

  const filtered = products.filter((p) => {
    if (filter === "high") return p.adRateOverLimit;
    if (filter === "1차") return p.adTier === "1차";
    if (filter === "2차") return p.adTier === "2차";
    if (filter === "3차") return p.adTier === "3차";
    return true;
  });

  const gradeChartData = [
    { name: "A등급", value: summary.gradeSpendPercent.A, target: 80, fill: "#3b82f6" },
    { name: "B등급", value: summary.gradeSpendPercent.B, target: 15, fill: "#94a3b8" },
    { name: "C등급", value: summary.gradeSpendPercent.C, target: 5, fill: "#f97316" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">광고 관리</h1>
        <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
          <Download size={16} /> 엑셀 다운로드
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 card-label"><Megaphone size={16} /> 총 광고비</div>
          <div className="card-value">{formatKRW(summary.totalSpend)}원</div>
        </div>
        <div className="card">
          <div className="card-label">ROAS</div>
          <div className={`card-value ${ROAS_STATUS_COLOR[summary.overallRoasStatus]}`}>{summary.overallRoas}%</div>
        </div>
        <div className={`rounded-xl p-4 border ${AD_RATE_STATUS_STYLE[summary.overallAdRateStatus]}`}>
          <div className="card-label">광고비율</div>
          <div className={`card-value ${AD_RATE_STATUS_TEXT_COLOR[summary.overallAdRateStatus]}`}>{summary.overallAdRate}%</div>
          <div className="text-xs text-slate-500 mt-1">목표: 업계평균</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle size={16} /> {adRateT.warning}% 초과</div>
          <div className="card-value text-red-700">{summary.highAdCount}개</div>
        </div>
      </div>

      {/* Rules */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h4 className="font-semibold text-sm text-slate-700 mb-2"><TrendingDown size={16} className="inline mr-1" />자동 규칙</h4>
        <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="bg-white p-3 rounded-lg border">광고비율 &gt; {adRateT.warning}% &rarr; <strong className="text-red-600">점검 알림</strong></div>
          <div className="bg-white p-3 rounded-lg border">ROAS &lt; {roasT.warning}% &rarr; <strong className="text-orange-600">효율 낮음 알림</strong></div>
          <div className="bg-white p-3 rounded-lg border">7일 연속 적자 &rarr; <strong className="text-red-600">광고 중단 추천</strong></div>
          <div className="bg-white p-3 rounded-lg border">A등급 광고비 &lt; 80% &rarr; <strong className="text-purple-600">재배분 추천</strong></div>
          <div className="bg-white p-3 rounded-lg border">전환율 &lt; 평균50% &rarr; <strong className="text-orange-600">개선 필요</strong></div>
          <div className="bg-white p-3 rounded-lg border">예산 배분 기준 &rarr; <strong className="text-purple-600">1차/2차/3차 등급별</strong></div>
        </div>
      </div>

      {/* Budget Allocation */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">등급별 광고비 배분 (목표: A등급 80%)</h3>
           <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
             <BarChart data={gradeChartData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} fontSize={12} />
              <YAxis type="category" dataKey="name" width={60} fontSize={12} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => [`${v}%`, "비중"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {gradeChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span>A등급: <strong className="text-purple-600">{summary.gradeSpendPercent.A}%</strong> (목표 80%)</span>
            <span>B등급: <strong>{summary.gradeSpendPercent.B}%</strong></span>
            <span>C등급: <strong className="text-orange-600">{summary.gradeSpendPercent.C}%</strong></span>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">광고 등급별 배분 (1차:15 / 2차:10 / 3차:5)</h3>
          <div className="space-y-4 mt-6">
            {["1차", "2차", "3차"].map((tier) => {
              const spend = summary.tierSpend[tier] || 0;
              const pct = summary.totalSpend > 0 ? (spend / summary.totalSpend) * 100 : 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium">{tier}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 relative">
                    <div className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.min(pct, 100)}%` }}>
                      <span className="text-xs text-white font-medium">{Math.round(pct)}%</span>
                    </div>
                  </div>
                  <span className="text-sm text-slate-500 w-24 text-right">{formatKRW(spend)}원</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Campaign List */}
      {campaignData?.campaigns && campaignData.campaigns.length > 0 && (
        <CampaignList campaigns={campaignData.campaigns} />
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "전체" },
          { key: "high", label: `${adRateT.warning}% 초과 (${products.filter(p => p.adRateOverLimit).length})` },
          { key: "1차", label: "1차 (핵심)" },
          { key: "2차", label: "2차 (성장)" },
          { key: "3차", label: "3차 (테스트)" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f.key ? "bg-purple-600 text-white" : "bg-white border border-slate-200 hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <AdsTable filtered={filtered} />

    </div>
  );
}
