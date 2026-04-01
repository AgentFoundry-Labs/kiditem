"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AdsListItem as AdProduct, AdsSummary as AdSummary } from '@kiditem/shared';
import { formatKRW } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { queryKeys } from "@/lib/query-keys";

import { AdsOverviewTab } from "./components/AdsOverviewTab";
import { AdsStrategyTab, buildActions } from "./components/AdsStrategyTab";

export default function AdsHubPage() {
  const queryClient = useQueryClient();
  const [activeGrade, setActiveGrade] = useState<"A" | "B" | "C">("A");
  const [activeTab, setActiveTab] = useState<"overview" | "strategy">("overview");
  const [tierUpdating, setTierUpdating] = useState<string | null>(null);

  const { data: adData = null, isLoading: loading } = useQuery({
    queryKey: queryKeys.ads.hub(),
    queryFn: () => apiClient.get<{ products: AdProduct[]; summary: AdSummary }>('/api/ads/hub'),
  });

  const tierMutation = useMutation({
    mutationFn: ({ productId, newTier }: { productId: string; newTier: string }) =>
      apiClient.patch(`/api/ads/${productId}/tier`, { adTier: newTier }),
    onMutate: ({ productId }) => setTierUpdating(productId),
    onSuccess: (_data, { productId, newTier }) => {
      queryClient.setQueryData(queryKeys.ads.hub(), (prev: { products: AdProduct[]; summary: AdSummary } | undefined) =>
        prev
          ? {
              ...prev,
              products: prev.products.map((p) =>
                p.id === productId ? { ...p, adTier: newTier === "OFF" ? null : newTier } : p
              ),
            }
          : prev
      );
    },
    onSettled: () => setTierUpdating(null),
  });

  const changeTier = (productId: string, newTier: string) => {
    tierMutation.mutate({ productId, newTier });
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
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.ads.hub() })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors"
          >
            <RefreshCw size={12} /> 새로고침
          </button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <AdsOverviewTab
          adData={adData}
          activeGrade={activeGrade}
          setActiveGrade={setActiveGrade}
          gradeProducts={gradeProducts}
          gradeStats={gradeStats}
          gradeRoas={gradeRoas}
          gradeProfitRate={gradeProfitRate}
          monthlyTrendData={monthlyTrendData}
          changeTier={changeTier}
          tierUpdating={tierUpdating}
        />
      ) : (
        <AdsStrategyTab actions={actions} />
      )}
    </div>
  );
}
