"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState } from "react";
import { RotateCcw, RefreshCw, Loader2, CheckCircle } from "lucide-react";
import { formatKRW } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReturnItem = any;

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [exchanges, setExchanges] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"return" | "exchange">("return");
  const [processing, setProcessing] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [retRes, exRes] = await Promise.all([
        fetch(`${API_BASE}/api/returns?type=return`),
        fetch(`${API_BASE}/api/returns?type=exchange`),
      ]);

      if (retRes.ok) {
        const retData = await retRes.json();
        setReturns(retData.data || []);
      }
      if (exRes.ok) {
        const exData = await exRes.json();
        setExchanges(exData.data || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApproveReturn = async (receiptId: number) => {
    if (!confirm("이 반품을 승인하시겠습니까?")) return;
    setProcessing(receiptId);
    try {
      const res = await fetch(`${API_BASE}/api/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", receiptId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "승인 실패");
      alert(data.message);
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setProcessing(null);
    }
  };

  const currentData = tab === "return" ? returns : exchanges;

  // Korean mapping for return reason codes
  const reasonLabels: Record<string, string> = {
    // String codes
    CHANGE_MIND: "고객변심",
    ORDER_MISTAKE: "주문실수",
    BETTER_PRICE: "다른 곳에서 더 저렴",
    LATE_DELIVERY: "배송 지연",
    WRONG_DELIVERY: "오배송",
    DEFECTIVE: "상품 불량/파손",
    DIFFERENT_FROM_DESC: "상품 상이",
    MISSING_PARTS: "부품/구성품 누락",
    SIZE_COLOR_CHANGE: "사이즈/색상 변경",
    // Coupang numeric codes
    "10ac": "고객변심",
    "10bc": "주문실수",
    "20ac": "상품 불량",
    "20bc": "오배송",
    "20cc": "상품 상이",
    "20dc": "배송 지연",
  };

  // Korean mapping for status codes
  const statusLabels: Record<string, { label: string; color: string }> = {
    UC: { label: "미확인", color: "bg-red-100 text-red-800" },
    RC: { label: "수거완료", color: "bg-blue-100 text-blue-800" },
    CC: { label: "완료", color: "bg-green-100 text-green-800" },
    RETURNS_COMPLETED: { label: "반품완료", color: "bg-green-100 text-green-800" },
    RETURNS_REQUESTED: { label: "반품요청", color: "bg-yellow-100 text-yellow-800" },
    RETURNS_ACCEPTED: { label: "반품승인", color: "bg-blue-100 text-blue-800" },
    EXCHANGE_REQUESTED: { label: "교환요청", color: "bg-purple-100 text-purple-800" },
    EXCHANGE_COMPLETED: { label: "교환완료", color: "bg-green-100 text-green-800" },
  };

  // Helper function to get reason label
  const getReasonLabel = (reason: string | undefined): string => {
    if (!reason) return "-";
    // If it's already Korean text (contains Hangul), return as-is
    if (/[\uAC00-\uD7AF]/.test(reason)) return reason;
    // Otherwise, look up in mapping
    return reasonLabels[reason] || reason;
  };

  // Helper function to get status label with color
  const getStatusLabel = (status: string | undefined): { label: string; color: string } => {
    if (!status) return { label: "-", color: "bg-slate-100 text-slate-600" };
    return statusLabels[status] || { label: status, color: "bg-slate-100 text-slate-600" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <RotateCcw size={24} className="inline mr-2" />
          반품/교환 관리
        </h1>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-slate-50">
                  <th>접수번호</th>
                  <th>주문번호</th>
                  <th>요청일</th>
                  <th>요청자</th>
                  <th>반품사유</th>
                  <th>상태</th>
                  <th>환불금액</th>
                  <th>액션</th>
                </tr>
              </thead>
               <tbody>
                 {returns.map((r: ReturnItem) => {
                   const st = getStatusLabel(r.receiptStatus);
                   const reason = getReasonLabel(r.cancelReason || r.cancelReasonCategory1);

                   return (
                     <tr key={r.receiptId}>
                       <td className="text-xs font-mono">{r.receiptId}</td>
                       <td className="text-xs font-mono text-slate-500">{r.orderId}</td>
                       <td className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString("ko-KR")}</td>
                       <td className="text-sm">{r.requesterName || "-"}</td>
                       <td className="text-sm max-w-[200px] truncate">{reason}</td>
                       <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span></td>
                       <td className="text-right">{r.enclosePrice ? `${formatKRW(r.enclosePrice)}원` : "-"}</td>
                       <td>
                         {r.receiptStatus === "UC" && (
                           <button
                             onClick={() => handleApproveReturn(r.receiptId)}
                             disabled={processing === r.receiptId}
                             className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                           >
                             {processing === r.receiptId ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                             승인
                           </button>
                         )}
                       </td>
                     </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-slate-50">
                  <th>접수번호</th>
                  <th>주문번호</th>
                  <th>요청일</th>
                  <th>상태</th>
                  <th>사유</th>
                </tr>
              </thead>
               <tbody>
                 {exchanges.map((e: ReturnItem, i: number) => {
                   const st = getStatusLabel(e.receiptStatus || e.status);
                   const reason = getReasonLabel(e.cancelReason);

                   return (
                     <tr key={e.receiptId || i}>
                       <td className="text-xs font-mono">{e.receiptId || "-"}</td>
                       <td className="text-xs font-mono text-slate-500">{e.orderId || "-"}</td>
                       <td className="text-xs text-slate-500">{e.createdAt ? new Date(e.createdAt).toLocaleDateString("ko-KR") : "-"}</td>
                       <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span></td>
                       <td className="text-sm max-w-[250px] truncate">{reason}</td>
                     </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
