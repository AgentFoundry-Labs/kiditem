'use client';
import { Check, Printer, FileText } from "lucide-react";
import { cn, formatKRW, formatDate, formatTime } from "@/lib/utils";
import type { OrderListItem } from '@kiditem/shared';
import type { OrderPipelineNode } from '../lib/order-pipeline';

interface OrderTableProps {
  activeNode: string;
  activeOrders: OrderListItem[];
  allNodes: OrderPipelineNode[];
  selectedOrders: Record<string, boolean>;
  selectedCount: number;
  allChecked: boolean;
  loading: boolean;
  error: string | null;
  confirming: boolean;
  invoicing: boolean;
  onToggleAll: () => void;
  onToggleOrder: (id: string) => void;
  onConfirm: () => void;
  onPrintLabel: () => void;
  onInvoice: () => void;
}

export default function OrderTable({
  activeNode, activeOrders, allNodes, selectedOrders, selectedCount,
  allChecked, loading, error, confirming, invoicing,
  onToggleAll, onToggleOrder, onConfirm, onPrintLabel, onInvoice,
}: OrderTableProps) {
  const nodeInfo = allNodes.find((n) => n.key === activeNode);
  const actionPending = confirming || invoicing;
  const isAcceptNode = activeNode === 'ACCEPT';

  return (
    <div className="table-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle,#f1f5f9)]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nodeInfo?.color }} />
          <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
            {nodeInfo?.label}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">{activeOrders.length} orders</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onConfirm}
            disabled={selectedCount === 0 || !isAcceptNode || actionPending}
            title={!isAcceptNode ? '신규주문 단계에서만 발주확인 가능' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={12} />
            CONFIRM ({selectedCount})
          </button>
          <button
            onClick={onPrintLabel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          >
            <Printer size={12} />
            PRINT LABEL
          </button>
          <button
            onClick={onInvoice}
            disabled={selectedCount === 0 || actionPending}
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
            <div key={i} className="h-12 bg-slate-100 rounded" />
          ))}
        </div>
      ) : error && activeOrders.length === 0 ? (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      ) : activeOrders.length === 0 ? (
        <div className="empty-state text-xs font-mono">
          NO ORDERS IN THIS STAGE
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={onToggleAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                  <tr key={order.id} className={cn('hover:bg-slate-50', isSelected && 'bg-blue-50/50')}>
                    <td className="w-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleOrder(order.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>
                    <td className="max-w-[280px]">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {order.primaryProductName || "-"}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-slate-400">#{order.displayOrderNumber}</span>
                        {order.primaryOptionName && (
                          <span className="text-[11px] text-slate-400">{order.primaryOptionName}</span>
                        )}
                        {order.lineItemCount > 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
                            +{order.lineItemCount - 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="font-medium">{formatKRW(order.totalPrice)}원</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{order.totalQuantity}개</div>
                    </td>
                    <td className="text-xs text-slate-600">{order.customerName || order.receiverName || "-"}</td>
                    <td className="text-xs text-slate-500 max-w-[160px]" title={order.receiverAddr || undefined}>
                      {addrDisplay}
                      {order.memo && (
                        <div className="text-[11px] text-amber-600 mt-0.5 truncate max-w-[160px]" title={order.memo}>
                          {order.memo}
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">
                      {formatDate(order.orderedAt)}
                      <br />
                      <span className="text-slate-400">
                        {formatTime(order.orderedAt, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && order.shippedAt && (
                        <div className="text-[11px] text-blue-500 mt-1">
                          출고 {formatDate(order.shippedAt)}
                        </div>
                      )}
                      {activeNode === "FINAL_DELIVERY" && order.deliveredAt && (
                        <div className="text-[11px] text-green-600 mt-1">
                          배송완료 {formatDate(order.deliveredAt)}
                        </div>
                      )}
                    </td>
                    {(activeNode === "DEPARTURE" || activeNode === "DELIVERING") && (
                      <td className="text-xs text-slate-500">
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
