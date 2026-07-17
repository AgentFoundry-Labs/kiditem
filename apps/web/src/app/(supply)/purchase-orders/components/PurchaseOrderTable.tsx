'use client';

import { Package, Trash2 } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW } from '@/lib/utils';
import type { PurchaseOrder } from '../lib/purchase-orders-api';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '임시저장', color: 'bg-slate-100 text-slate-700' },
  pending: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  ordered: { label: '발주완료', color: 'bg-blue-100 text-blue-700' },
  shipped: { label: '배송중', color: 'bg-purple-100 text-purple-700' },
  received: { label: '입고완료', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-700' },
};

const TRANSITION_LABELS: Record<string, string> = {
  pending: '발주대기',
  ordered: '발주확정',
  shipped: '배송시작',
  received: '입고완료',
};

const NEXT_STATUS: Record<string, string> = {
  draft: 'pending',
  pending: 'ordered',
  ordered: 'shipped',
  shipped: 'received',
};

interface PurchaseOrderTableProps {
  orders: PurchaseOrder[];
  loading: boolean;
  actionLoading: string | null;
  page: number;
  pageSize: number;
  total: number;
  selectedOrderId?: string;
  onPageChange: (page: number) => void;
  onStatusChange: (id: string, newStatus: string) => void;
  onSubmit: (id: string) => void;
  onReconcile: (
    id: string,
    outcome: 'provider_succeeded' | 'provider_failed',
  ) => void;
  onDelete: (id: string) => void;
}

export function PurchaseOrderTable({ orders, loading, actionLoading, page, pageSize, total, selectedOrderId, onPageChange, onStatusChange, onSubmit, onReconcile, onDelete }: PurchaseOrderTableProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-slate-100 rounded" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-20 text-center">
        <Package size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500">발주 내역이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>상태</th>
              <th>공급업체</th>
              <th>품목</th>
              <th className="text-right">총금액 (CNY)</th>
              <th>발주일</th>
              <th>입고예정일</th>
              <th>트래킹번호</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const statusInfo = STATUS_MAP[order.status] || { label: order.status, color: 'bg-slate-100 text-slate-700' };
              const nextStatus = NEXT_STATUS[order.status];
              const attempt = order.latestSubmissionAttempt;
              const providerUnknown = attempt?.status === 'provider_unknown';
              const providerFailed = attempt?.status === 'provider_failed';
              const needsReconciliation = providerUnknown || providerFailed;
              const canDelete = (order.status === 'draft' || order.status === 'pending')
                && !attempt;
              const isActioning = actionLoading === order.id;
              const isSelected = selectedOrderId === order.id;

              return (
                <tr
                  key={order.id}
                  aria-selected={isSelected}
                  className={cn(
                    'transition-colors',
                    isSelected
                      ? 'bg-purple-50 ring-1 ring-inset ring-purple-200'
                      : 'hover:bg-slate-50',
                  )}
                >
                  <td>
                    <span className={cn('inline-flex px-2 py-0.5 text-xs font-medium rounded-full', statusInfo.color)}>
                      {statusInfo.label}
                    </span>
                    {providerUnknown ? (
                      <p className="mt-1 max-w-[180px] text-xs font-medium text-amber-700">
                        외부 주문 생성됨 · 반영 확인 필요
                      </p>
                    ) : null}
                    {providerFailed ? (
                      <p className="mt-1 max-w-[180px] text-xs font-medium text-red-700">
                        외부 주문 실패 · 재시도 전 확인 필요
                      </p>
                    ) : null}
                  </td>
                  <td className="font-medium text-slate-900">
                    {order.supplier?.name || order.supplierName}
                  </td>
                  <td className="text-sm text-slate-600 max-w-[200px] truncate">
                    {order.items.length > 0
                      ? order.items.map((i) => `${i.productName}(${i.quantity})`).join(', ')
                      : '-'}
                  </td>
                  <td className="text-right tabular-nums font-semibold">
                    {formatKRW(parseFloat(order.totalAmountCny))}
                  </td>
                  <td className="text-sm text-slate-500 tabular-nums">
                    {new Date(order.orderDate).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="text-sm text-slate-500 tabular-nums">
                    {order.expectedDeliveryDate
                      ? new Date(order.expectedDeliveryDate).toLocaleDateString('ko-KR')
                      : '-'}
                  </td>
                  <td className="text-sm text-slate-500 font-mono">
                    {order.trackingNumber || '-'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {nextStatus && !needsReconciliation && (
                        <button
                          onClick={() => nextStatus === 'ordered'
                            ? onSubmit(order.id)
                            : onStatusChange(order.id, nextStatus)}
                          disabled={isActioning}
                          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded disabled:opacity-50"
                        >
                          {isActioning ? '...' : TRANSITION_LABELS[nextStatus]}
                        </button>
                      )}
                      {needsReconciliation ? (
                        <>
                          {providerUnknown ? (
                            <button
                              onClick={() => onReconcile(order.id, 'provider_succeeded')}
                              disabled={isActioning}
                              className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              외부 주문 확인
                            </button>
                          ) : null}
                          <button
                            onClick={() => onReconcile(order.id, 'provider_failed')}
                            disabled={isActioning}
                            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                          >
                            외부 주문 없음
                          </button>
                        </>
                      ) : null}
                      {canDelete && (
                        <button
                          onClick={() => onDelete(order.id)}
                          disabled={isActioning}
                          className="p-1 text-slate-400 hover:text-red-500 rounded disabled:opacity-50"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
