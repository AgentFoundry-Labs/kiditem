'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Package, Truck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

interface PendingOrder {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string | null;
  status: string;
  orderedAt: string;
  expectedAt: string | null;
  currentStock: number;
}

const statusLabels: Record<string, { text: string; color: string }> = {
  ordered: { text: '발주완료', color: 'bg-blue-100 text-blue-700' },
  shipped: { text: '배송중', color: 'bg-orange-100 text-orange-700' },
};

export default function PendingDelivery() {
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'ordered' | 'shipped'
  >('all');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({ status: 'ordered' }),
    queryFn: () =>
      apiClient.get<{ items: PendingOrder[]; total: number }>(
        '/api/purchase-orders?status=ordered'
      ),
  });

  const orders = data?.items ?? [];

  const now = new Date();
  const calcDaysElapsed = (orderedAt: string) =>
    Math.floor(
      (now.getTime() - new Date(orderedAt).getTime()) / 86400000
    );
  const isDelayed = (expectedAt: string | null) =>
    expectedAt ? new Date(expectedAt) < now : false;

  const filtered = orders.filter(
    (o) => filterStatus === 'all' || o.status === filterStatus
  );
  const delayedCount = orders.filter((o) => isDelayed(o.expectedAt)).length;
  const totalPendingQty = orders.reduce((s, o) => s + o.quantity, 0);
  const totalPendingCost = orders.reduce((s, o) => s + o.totalCost, 0);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ko-KR');

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">미송 건수</p>
          <p className="text-2xl font-bold text-orange-600">
            {isLoading ? '-' : `${orders.length}건`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">미송 수량</p>
          <p className="text-2xl font-bold text-slate-800">
            {isLoading ? '-' : `${formatNumber(totalPendingQty)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">미송 금액</p>
          <p className="text-2xl font-bold text-slate-800">
            {isLoading ? '-' : `${formatNumber(totalPendingCost)}원`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-slate-500 mb-1">지연 건수</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {isLoading ? '-' : `${delayedCount}건`}
          </p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {(['all', 'ordered', 'shipped'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s === 'all' ? '전체' : (statusLabels[s]?.text || s)}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            미송 발주 목록
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">공급업체</th>
                <th className="text-center py-2 px-3">상태</th>
                <th className="text-right py-2 px-3">수량</th>
                <th className="text-right py-2 px-3">금액</th>
                <th className="text-center py-2 px-3">발주일</th>
                <th className="text-center py-2 px-3">예상입고일</th>
                <th className="text-center py-2 px-3">경과일</th>
                <th className="text-right py-2 px-3">현재재고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-slate-400"
                  >
                    로딩 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-slate-400"
                  >
                    미송 발주 없음
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const elapsed = calcDaysElapsed(o.orderedAt);
                  const delayed = isDelayed(o.expectedAt);
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 ${delayed ? 'bg-red-50' : ''}`}
                    >
                      <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                        {o.productName}
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {o.supplier || '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${statusLabels[o.status]?.color || 'bg-gray-100 text-gray-600'}`}
                        >
                          {statusLabels[o.status]?.text || o.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(o.quantity)}개
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(o.totalCost)}원
                      </td>
                      <td className="py-2 px-3 text-center text-xs">
                        {fmtDate(o.orderedAt)}
                      </td>
                      <td className="py-2 px-3 text-center text-xs">
                        {o.expectedAt ? (
                          <span
                            className={
                              delayed ? 'text-red-600 font-bold' : ''
                            }
                          >
                            {fmtDate(o.expectedAt)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 ${delayed ? 'text-red-600 font-bold' : 'text-slate-600'}`}
                        >
                          {delayed && (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          <Clock className="w-3 h-3" />
                          {elapsed}일
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(o.currentStock)}개
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
