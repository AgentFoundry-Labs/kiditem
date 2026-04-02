"use client";
import { Check, Printer, FileText } from "lucide-react";
import type { OrderRow } from "@kiditem/shared";
import { formatKRW } from "@/lib/utils";

interface OrderNode {
  key: string;
  label: string;
  sub: string;
  color: string;
}

interface OrderTableProps {
  activeNode: string;
  activeOrders: OrderRow[];
  allNodes: OrderNode[];
  selectedOrders: Record<string, boolean>;
  selectedCount: number;
  allChecked: boolean;
  loading: boolean;
  error: string | null;
  onToggleAll: () => void;
  onToggleOrder: (id: string) => void;
  onConfirm: () => void;
  onPrintLabel: () => void;
  onInvoice: () => void;
}

export default function OrderTable({
  activeNode, activeOrders, allNodes, selectedOrders, selectedCount,
  allChecked, loading, error, onToggleAll, onToggleOrder,
  onConfirm, onPrintLabel, onInvoice,
}: OrderTableProps) {
  const nodeInfo = allNodes.find((n) => n.key === activeNode);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nodeInfo?.color }} />
          <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
            {nodeInfo?.label}
          </span>
          <span className="text-[11px] text-gray-400 font-mono">{activeOrders.length} orders</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onConfirm}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={12} />
            CONFIRM ({selectedCount})
          </button>
          <button
            onClick={onPrintLabel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            <Printer size={12} />
            PRINT LABEL
          </button>
          <button
            onClick={onInvoice}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileText size={12} />
            INVOICE ({selectedCount})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      ) : error && activeOrders.length === 0 ? (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      ) : activeOrders.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-xs font-mono">
          NO ORDERS IN THIS STAGE
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="bg-gray-50">
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={onToggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th>상품명</th>
                <th className="text-right">금액</th>
                <th>주문자</th>
                <th>주소</th>
                <th>주문일</th>
                {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && <th>송장</th>}
              </tr>
            </thead>
            <tbody>
              {activeOrders.map((order) => {
                const isSelected = !!selectedOrders[order.id];
                const addrDisplay = order.receiverAddr
                  ? order.receiverAddr.length > 20
                    ? order.receiverAddr.slice(0, 20) + "…"
                    : order.receiverAddr
                  : "-";
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50/50" : ""}`}>
                    <td className="w-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleOrder(order.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="max-w-[280px]">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {order.productName || "-"}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-gray-400">#{order.orderNumber}</span>
                        {order.platform && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
                            {order.platform}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="font-medium">{formatKRW(order.totalPrice)}원</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{order.quantity}개</div>
                    </td>
                    <td className="text-xs text-gray-600">{order.customerName || order.receiverName || "-"}</td>
                    <td className="text-xs text-gray-500 max-w-[160px]" title={order.receiverAddr || undefined}>
                      {addrDisplay}
                      {order.memo && (
                        <div className="text-[11px] text-amber-600 mt-0.5 truncate max-w-[160px]" title={order.memo}>
                          {order.memo}
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-gray-500">
                      {new Date(order.orderedAt).toLocaleDateString("ko-KR")}
                      <br />
                      <span className="text-gray-400">
                        {new Date(order.orderedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && order.shippedAt && (
                        <div className="text-[11px] text-blue-500 mt-1">
                          출고 {new Date(order.shippedAt).toLocaleDateString("ko-KR")}
                        </div>
                      )}
                      {activeNode === "FINAL_DELIVERY" && order.deliveredAt && (
                        <div className="text-[11px] text-green-600 mt-1">
                          배송완료 {new Date(order.deliveredAt).toLocaleDateString("ko-KR")}
                        </div>
                      )}
                    </td>
                    {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && (
                      <td className="text-xs text-gray-500">
                        {order.shippingCompany || "-"}
                        <br />
                        {order.trackingNumber || "-"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
