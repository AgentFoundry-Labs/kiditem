"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Truck, AlertTriangle, RefreshCw } from "lucide-react";
import PageSkeleton from "@/components/ui/PageSkeleton";

interface UnshippedItem {
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

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.unshipped.list(minDays > 0 ? { minDays: String(minDays) } : undefined),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (minDays > 0) params.set("minDays", String(minDays));
      return apiClient.get<{ items: UnshippedItem[] }>(`/api/unshipped?${params}`);
    },
  });

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
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
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
            <h1 className="text-2xl font-bold text-gray-900">미배송 조회</h1>
            <span className="text-sm text-gray-500">
              {items.length}건 | 긴급 {critical.length}건
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
          >
            <option value={0}>전체</option>
            <option value={1}>1일 이상</option>
            <option value={3}>3일 이상</option>
            <option value={7}>7일 이상</option>
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500">전체</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {items.length}
          </div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <div className="text-sm text-orange-600">주의 (1-2일)</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">
            {warning.length}
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertTriangle size={14} /> 긴급 (3일+)
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {critical.length}
          </div>
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Truck size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">미배송 건이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-gray-50">
                  <th>지연일수</th>
                  <th>주문번호</th>
                  <th>상품명</th>
                  <th className="text-right">수량</th>
                  <th>주문일</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.delayDays >= 3
                        ? "bg-red-50/50"
                        : item.delayDays >= 1
                          ? "bg-orange-50/30"
                          : ""
                    }
                  >
                    <td
                      className={`text-center font-bold tabular-nums ${
                        item.delayDays >= 3
                          ? "text-red-600"
                          : item.delayDays >= 1
                            ? "text-orange-500"
                            : "text-gray-400"
                      }`}
                    >
                      {item.delayDays}일
                    </td>
                    <td className="text-sm text-gray-500 font-mono">
                      {item.orderId}
                    </td>
                    <td className="font-medium text-gray-900 max-w-[250px] truncate">
                      {item.productName}
                    </td>
                    <td className="text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="text-sm text-gray-400 tabular-nums">
                      {new Date(item.orderDate).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="text-sm text-gray-500">
                      {item.reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
