'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import PageSkeleton from "@/components/ui/PageSkeleton";
import UnshippedSummaryCards from "./components/UnshippedSummaryCards";
import UnshippedItemsTable from "./components/UnshippedItemsTable";

export interface UnshippedItem {
  id: string;
  orderId: string;
  productName: string;
  quantity: number;
  orderDate: string;
  delayDays: number;
  reason: string | null;
}

export default function UnshippedItemsPage() {
  const [minDays, setMinDays] = useState(0);

  const { data, isLoading: loading, isFetching, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.unshipped.list(minDays > 0 ? { minDays: String(minDays) } : undefined),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (minDays > 0) params.set("minDays", String(minDays));
      return apiClient.get<{ items: UnshippedItem[] }>(`/api/unshipped?${params}`);
    },
    placeholderData: previousData => previousData,
  });
  const isRefreshing = isFetching && !loading;

  const items = data?.items ?? [];
  const error = queryError ? (isApiError(queryError) ? queryError.detail : "미배송 조회 실패") : null;

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const critical = items.filter((i) => i.delayDays >= 3);
  const warning = items.filter((i) => i.delayDays >= 1 && i.delayDays < 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck size={20} className="text-red-600" />
          <div>
            <h1 className="page-title">미배송 조회</h1>
            <span className="text-sm text-slate-500">
              {items.length}건 | 긴급 {critical.length}건
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2"
          >
            <option value={0}>전체</option>
            <option value={1}>1일 이상</option>
            <option value={3}>3일 이상</option>
            <option value={7}>7일 이상</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} /> 새로고침
          </button>
        </div>
      </div>

      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          미배송 목록을 갱신 중입니다.
        </div>
      )}

      <div className="space-y-6" aria-busy={isRefreshing}>
      <UnshippedSummaryCards total={items.length} warning={warning.length} critical={critical.length} />

      <UnshippedItemsTable items={items} />
      </div>
    </div>
  );
}
