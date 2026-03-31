"use client";

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import { BarChart3, RefreshCw } from "lucide-react";
import { formatKRW, formatPercent } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";

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

export default function SalesAnalysisPage() {
  const [data, setData] = useState<SalesAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      const res = await fetch(`${API_BASE}/api/sales-analysis?${params}`);
      if (!res.ok) throw new Error("서버 오류");
      const json: SalesAnalysisData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "매출분석 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          onClick={fetchData}
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
            <option value="">전체 기간</option>
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={fetchData}
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

          {data.channels.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">매출 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr className="bg-gray-50">
                      <th>채널명</th>
                      <th>유형</th>
                      <th className="text-right">주문수</th>
                      <th className="text-right">매출</th>
                      <th className="text-right">비용</th>
                      <th className="text-right">이익</th>
                      <th className="text-right">반품수</th>
                      <th className="text-right">반품률</th>
                      <th className="text-right">평균주문금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((row) => (
                      <tr key={row.channelName}>
                        <td>
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {row.channelName}
                          </span>
                        </td>
                        <td className="text-sm text-gray-700">
                          {row.channelType}
                        </td>
                        <td className="text-right tabular-nums">
                          {row.totalOrders.toLocaleString()}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatKRW(row.totalRevenue)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatKRW(row.totalCost)}
                        </td>
                        <td
                          className={`text-right tabular-nums font-medium ${
                            row.totalProfit >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatKRW(row.totalProfit)}
                        </td>
                        <td className="text-right tabular-nums">
                          {row.returnCount.toLocaleString()}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatPercent(row.returnRate)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatKRW(row.avgOrderValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
