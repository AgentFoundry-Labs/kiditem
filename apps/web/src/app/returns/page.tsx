"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { RotateCcw, RefreshCw, Loader2 } from "lucide-react";
import { ReturnsTable, ExchangesTable } from "./components/ReturnsTables";

interface ReturnItem {
  id: string;
  receiptId: number;
  orderId: string;
  requesterName: string;
  receiptStatus: string;
  receiptType: string;
  faultByType: string;
  cancelReason: string;
  cancelReasonCategory1: string;
  cancelReasonCategory2: string;
  reasonCodeText: string;
  enclosePrice: number;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
  status?: string;
  returnItems?: { id: string; vendorItemName: string; sellerProductName: string; purchaseCount: number; cancelCount: number }[];
}

export default function ReturnsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"return" | "exchange">("return");
  const [processing, setProcessing] = useState<number | null>(null);

  const { data: returnsData, isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.returns.list(),
    queryFn: async () => {
      const [retResult, exResult] = await Promise.allSettled([
        apiClient.get<{ items: ReturnItem[] }>('/api/returns?type=return'),
        apiClient.get<{ items: ReturnItem[] }>('/api/returns?type=exchange'),
      ]);
      return {
        returns: retResult.status === 'fulfilled' ? (retResult.value.items || []) : [],
        exchanges: exResult.status === 'fulfilled' ? (exResult.value.items || []) : [],
      };
    },
  });

  const returns = returnsData?.returns ?? [];
  const exchanges = returnsData?.exchanges ?? [];
  const error = queryError ? (isApiError(queryError) ? queryError.detail : "조회 실패") : null;

  const approveMutation = useMutation({
    mutationFn: async (receiptId: number) => {
      return apiClient.post<{ message: string }>('/api/returns', { action: "approve", receiptId });
    },
    onMutate: (receiptId) => setProcessing(receiptId),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all });
    },
    onError: (e) => toast.error(isApiError(e) ? e.detail : e instanceof Error ? e.message : "처리 실패"),
    onSettled: () => setProcessing(null),
  });

  const handleApproveReturn = (receiptId: number) => {
    if (!confirm("이 반품을 승인하시겠습니까?")) return;
    approveMutation.mutate(receiptId);
  };

  const currentData = tab === "return" ? returns : exchanges;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <RotateCcw size={24} className="inline mr-2" />
          반품/교환 관리
        </h1>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl p-4 border cursor-pointer transition-colors ${tab === "return" ? "bg-red-50 border-red-300" : "bg-white border-slate-200 hover:border-red-200"}`} onClick={() => setTab("return")}>
          <div className="text-sm text-red-600">반품 요청</div>
          <div className="text-2xl font-bold text-red-700">{returns.length}건</div>
        </div>
        <div className={`rounded-xl p-4 border cursor-pointer transition-colors ${tab === "exchange" ? "bg-orange-50 border-orange-300" : "bg-white border-slate-200 hover:border-orange-200"}`} onClick={() => setTab("exchange")}>
          <div className="text-sm text-orange-600">교환 요청</div>
          <div className="text-2xl font-bold text-orange-700">{exchanges.length}건</div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> 조회 중...
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : currentData.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {tab === "return" ? "반품" : "교환"} 요청이 없습니다.
        </div>
      ) : tab === "return" ? (
        <ReturnsTable returns={returns} processing={processing} onApprove={handleApproveReturn} />
      ) : (
        <ExchangesTable exchanges={exchanges} />
      )}
    </div>
  );
}
