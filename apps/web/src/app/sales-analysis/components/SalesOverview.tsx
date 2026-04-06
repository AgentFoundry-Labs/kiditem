"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { formatKRW, formatPercent } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { ChannelTable } from "./ChannelTable";

interface ChannelRow {
  channelName: string;
  channelType: string;
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  returnCount: number;
  returnRate: number;
  avgOrderValue: number;
}

interface SalesAnalysisData {
  period: string;
  channels: ChannelRow[];
  totals: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    totalCost: number;
  };
}

export default function SalesOverview() {
  const prevMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [period, setPeriod] = useState(prevMonth);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.salesAnalysis.data(period),
    queryFn: () => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      return apiClient.get<SalesAnalysisData>(`/api/sales-analysis?${params}`);
    },
  });
  const error = queryError ? (isApiError(queryError) ? queryError.detail : "매출분석 조회 실패") : null;

  const periodOptions = (() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
    return opts;
  })();

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const totalReturnCount =
    data?.channels.reduce((s, c) => s + c.returnCount, 0) ?? 0;
  const totalOrders = data?.totals.totalOrders ?? 0;
  const returnRate =
    totalOrders > 0
      ? Math.round((totalReturnCount / totalOrders) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">통합매출분석</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
          >
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-sm text-gray-500">총매출</div>
              <div className="text-xl font-bold text-gray-900 mt-1">
                {formatKRW(data.totals.totalRevenue)}원
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-sm text-gray-500">총비용</div>
              <div className="text-xl font-bold text-gray-900 mt-1">
                {formatKRW(data.totals.totalCost)}원
              </div>
            </div>
            <div
              className={`rounded-xl p-4 border ${
                data.totals.totalProfit >= 0
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="text-sm text-gray-500">총이익</div>
              <div
                className={`text-xl font-bold mt-1 ${
                  data.totals.totalProfit >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {formatKRW(data.totals.totalProfit)}원
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-sm text-gray-500">반품률</div>
              <div className="text-xl font-bold text-gray-900 mt-1">
                {formatPercent(returnRate)}
              </div>
            </div>
          </div>

          <ChannelTable channels={data.channels} />
        </>
      )}
    </div>
  );
}
