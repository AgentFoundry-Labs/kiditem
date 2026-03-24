"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  CheckCircle,
  Truck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatKRW } from "@/lib/utils";

interface OrderItem {
  vendorItemId: number;
  vendorItemName: string;
  sellerProductId: number;
  sellerProductName: string;
  shippingCount: number;
  salesPrice: number;
  orderPrice: number;
}

interface OrderSheet {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  paidAt: string;
  status: string;
  receiver: { name: string; addr1: string; addr2: string; postCode: string; safeNumber: string };
  orderer: { name: string };
  orderItems: OrderItem[];
  deliveryCompanyName?: string;
  invoiceNumber?: string;
}

interface DeliveryCompany {
  code: string;
  name: string;
}

const STATUS_TABS = [
  { key: "ACCEPT", label: "신규주문", color: "text-blue-600" },
  { key: "INSTRUCT", label: "발주확인", color: "text-purple-600" },
  { key: "DEPARTURE", label: "출고완료", color: "text-orange-600" },
  { key: "DELIVERING", label: "배송중", color: "text-green-600" },
  { key: "FINAL_DELIVERY", label: "배송완료", color: "text-slate-600" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ACCEPT");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deliveryCompanies, setDeliveryCompanies] = useState<DeliveryCompany[]>([]);
  const [processing, setProcessing] = useState(false);

  // 송장 입력 모달
  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    shipmentBoxId: number;
    orderName: string;
  } | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ deliveryCompanyCode: "CJGLS", invoiceNumber: "" });

  const fetchOrders = async (status: string) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE}/api/orders?status=${status}&from=${weekAgo}&to=${today}`);
      if (!res.ok) throw new Error("주문 조회 실패");
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.deliveryCompanies) setDeliveryCompanies(data.deliveryCompanies);
      if (data.offline) setError("오프라인 모드: 저장된 데이터를 표시 중입니다. API 연결 후 실시간 데이터를 확인하세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(activeTab);
  }, [activeTab]);

  const handleConfirm = async () => {
    if (selected.size === 0) return alert("승인할 주문을 선택하세요.");
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", shipmentBoxIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "승인 실패");
      alert(data.message);
      fetchOrders(activeTab);
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setProcessing(false);
    }
  };

  const handleInvoiceSubmit = async () => {
    if (!invoiceModal || !invoiceForm.invoiceNumber.trim()) return alert("송장번호를 입력하세요.");
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invoice",
          shipmentBoxId: invoiceModal.shipmentBoxId,
          ...invoiceForm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "송장 전송 실패");
      alert(data.message);
      setInvoiceModal(null);
      setInvoiceForm({ deliveryCompanyCode: "CJGLS", invoiceNumber: "" });
      fetchOrders(activeTab);
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.shipmentBoxId)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <ShoppingCart size={24} className="inline mr-2" />
          주문 처리
        </h1>
        <button onClick={() => fetchOrders(activeTab)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : `text-slate-600 hover:bg-slate-50 ${tab.color}`
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Bar */}
      {activeTab === "ACCEPT" && orders.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-xl border border-blue-200">
          <span className="text-sm text-blue-800">
            {selected.size > 0 ? `${selected.size}건 선택됨` : "주문을 선택하세요"}
          </span>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0 || processing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            발주 확인 (승인)
          </button>
        </div>
      )}

      {activeTab === "INSTRUCT" && orders.length > 0 && (
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 text-sm text-purple-800">
          <Truck size={16} className="inline mr-1" />
          발주확인된 주문입니다. "송장 입력" 버튼을 눌러 배송정보를 전송하세요.
        </div>
      )}

      {/* Offline Banner */}
      {error && orders.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> 주문 조회 중...
        </div>
      ) : error && orders.length === 0 ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {STATUS_TABS.find((t) => t.key === activeTab)?.label} 주문이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-slate-50">
                  {(activeTab === "ACCEPT") && (
                    <th className="w-10">
                      <input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleAll} />
                    </th>
                  )}
                  <th>주문번호</th>
                  <th>주문일시</th>
                  <th>상품</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">금액</th>
                  <th>수취인</th>
                  <th>주소</th>
                  {(activeTab === "INSTRUCT") && <th>액션</th>}
                  {(activeTab === "DEPARTURE" || activeTab === "DELIVERING") && <th>송장</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const item = order.orderItems?.[0];
                  const totalQty = order.orderItems?.reduce((s, i) => s + i.shippingCount, 0) || 0;
                  const totalPrice = order.orderItems?.reduce((s, i) => s + i.orderPrice, 0) || 0;
                  return (
                    <tr key={order.shipmentBoxId} className="hover:bg-slate-50">
                      {activeTab === "ACCEPT" && (
                        <td>
                          <input type="checkbox" checked={selected.has(order.shipmentBoxId)} onChange={() => toggleSelect(order.shipmentBoxId)} />
                        </td>
                      )}
                      <td className="text-xs font-mono text-slate-500">{order.shipmentBoxId}</td>
                      <td className="text-xs text-slate-500">
                        {new Date(order.orderedAt).toLocaleDateString("ko-KR")}<br />
                        <span className="text-slate-400">{new Date(order.orderedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="max-w-[200px]">
                        <div className="text-sm font-medium text-slate-900 truncate">{item?.vendorItemName || item?.sellerProductName || "-"}</div>
                        {order.orderItems.length > 1 && (
                          <span className="text-xs text-slate-400">외 {order.orderItems.length - 1}건</span>
                        )}
                      </td>
                      <td className="text-right">{totalQty}</td>
                      <td className="text-right font-medium">{formatKRW(totalPrice)}원</td>
                      <td className="text-sm">{order.receiver?.name || "-"}</td>
                      <td className="text-xs text-slate-500 max-w-[200px] truncate">
                        {order.receiver?.addr1 || "-"}
                      </td>
                      {activeTab === "INSTRUCT" && (
                        <td>
                          <button
                            onClick={() => setInvoiceModal({
                              open: true,
                              shipmentBoxId: order.shipmentBoxId,
                              orderName: item?.vendorItemName || "",
                            })}
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                          >
                            송장 입력
                          </button>
                        </td>
                      )}
                      {(activeTab === "DEPARTURE" || activeTab === "DELIVERING") && (
                        <td className="text-xs text-slate-500">
                          {order.deliveryCompanyName || "-"}<br />
                          {order.invoiceNumber || "-"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setInvoiceModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">송장 정보 입력</h2>
            <p className="text-sm text-slate-500 mb-4 truncate">{invoiceModal.orderName}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">택배사</label>
                <select
                  value={invoiceForm.deliveryCompanyCode}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, deliveryCompanyCode: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {deliveryCompanies.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">송장번호</label>
                <input
                  type="text"
                  value={invoiceForm.invoiceNumber}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                  placeholder="송장번호 입력"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setInvoiceModal(null)} className="px-4 py-2 text-slate-600 border rounded-lg text-sm hover:bg-slate-50">
                취소
              </button>
              <button
                onClick={handleInvoiceSubmit}
                disabled={processing || !invoiceForm.invoiceNumber.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                송장 전송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
