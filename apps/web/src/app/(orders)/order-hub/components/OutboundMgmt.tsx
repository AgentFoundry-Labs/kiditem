'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PackageCheck,
  Truck,
  Clock,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface OutboundOrder {
  id: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  receiverName: string;
  receiverAddr: string;
  status: string;
  confirmedAt: string;
  shippedAt: string | null;
}

export default function OutboundMgmt() {
  const [processing] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders.list({ status: 'confirmed' }),
    queryFn: () =>
      apiClient.get<{ items: OutboundOrder[] }>(
        '/api/orders?status=confirmed'
      ),
  });

  const orders = data?.items ?? [];
  const shippedToday = 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const pendingCount = orders.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <PackageCheck size={24} className="inline mr-2" />
          출고 관리
        </h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            <RefreshCw size={14} />
            새로고침
          </button>
          {selectedIds.size > 0 && (
            <button
              disabled={bulkProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
            >
              {bulkProcessing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Truck size={16} />
              )}
              선택 일괄 출고 ({selectedIds.size}건)
            </button>
          )}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-yellow-600" />
            <div>
              <div className="card-label mb-1">오늘 출고 예정</div>
              <div className="card-value text-yellow-600">
                {isLoading ? '-' : `${pendingCount}건`}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <div className="card-label mb-1">출고 완료</div>
              <div className="card-value text-green-600">
                {isLoading ? '-' : `${shippedToday}건`}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-red-600" />
            <div>
              <div className="card-label mb-1">미출고</div>
              <div className="card-value text-red-600">
                {isLoading ? '-' : `${pendingCount}건`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 출고 대상 주문 목록 */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          로딩 중...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <PackageCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p>출고 대상 주문이 없습니다</p>
          <p className="text-xs mt-1">
            confirmed 상태의 주문이 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="table-card">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              출고 대상 ({orders.length}건)
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th className="text-left px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === orders.length && orders.length > 0
                    }
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th>
                  주문번호
                </th>
                <th>
                  상품명
                </th>
                <th className="text-right">
                  수량
                </th>
                <th>
                  수령인
                </th>
                <th>
                  확정일시
                </th>
                <th>
                  상태
                </th>
                <th className="text-center">
                  액션
                </th>
              </tr>
            </thead>
            <tbody >
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggleSelect(o.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {o.orderNumber}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                    {o.productName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {o.quantity}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.receiverName || '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {o.confirmedAt
                      ? new Date(o.confirmedAt).toLocaleString('ko-KR')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      출고대기
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={processing === o.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 mx-auto"
                    >
                      {processing === o.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Truck size={12} />
                      )}
                      출고 완료
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
