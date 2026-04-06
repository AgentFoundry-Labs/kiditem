'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Store,
  Package,
  DollarSign,
  ChevronDown,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW, formatNumber } from '@/lib/utils';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  status: string;
}

interface PurchaseOrder {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  company: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string | null;
  status: string;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  currentStock: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '대기', color: 'text-slate-600', bg: 'bg-slate-100' },
  ordered: { label: '발주', color: 'text-blue-600', bg: 'bg-blue-50' },
  shipped: { label: '배송중', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  inspecting: { label: '검수중', color: 'text-orange-600', bg: 'bg-orange-50' },
  received: { label: '입고완료', color: 'text-green-600', bg: 'bg-green-50' },
};

export default function SupplierPurchases() {
  const [selectedSupplier, setSelectedSupplier] = useState('');

  const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () =>
      apiClient.get<Supplier[]>('/api/suppliers'),
  });

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({ supplier: selectedSupplier }),
    queryFn: () =>
      apiClient.get<{ items: PurchaseOrder[]; total: number }>(
        `/api/purchase-orders?supplier=${selectedSupplier}`
      ),
    enabled: !!selectedSupplier,
  });

  const suppliers = suppliersData ?? [];
  const orders = ordersData?.items ?? [];

  const selectedName = suppliers.find((s) => s.id === selectedSupplier)?.name;
  const totalAmount = orders.reduce((s, o) => s + o.totalCost, 0);
  const totalQty = orders.reduce((s, o) => s + o.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart size={18} className="text-indigo-500" />
          <div>
            <h1 className="page-title">구매 관리</h1>
          </div>
        </div>
        <div className="relative">
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="appearance-none border rounded-lg px-4 py-2 pr-8 text-xs bg-white"
          >
            <option value="">매입처 선택</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* KPI - only when supplier selected */}
      {selectedSupplier && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card">
            <div className="flex items-center gap-1.5 mb-1">
              <Store size={12} className="text-indigo-500" />
              <span className="card-label">매입처</span>
            </div>
            <div className="card-value">{selectedName}</div>
          </div>
          <div className="card">
            <div className="flex items-center gap-1.5 mb-1">
              <Package size={12} className="text-blue-500" />
              <span className="card-label">발주 수량 합계</span>
            </div>
            <div className="card-value text-blue-600 tabular-nums">{loadingOrders ? '-' : `${formatNumber(totalQty)}개`}</div>
          </div>
          <div className="card">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={12} className="text-green-500" />
              <span className="card-label">발주 금액 합계</span>
            </div>
            <div className="card-value text-green-600 tabular-nums">{loadingOrders ? '-' : `${formatKRW(totalAmount)}원`}</div>
          </div>
        </div>
      )}

      {/* Content */}
      {!selectedSupplier ? (
        <div className="card">
          <div className="text-center py-16 text-slate-400">
            <Store size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm">매입처를 선택하면 발주 목록을 조회합니다.</p>
            <p className="text-xs mt-1">총 {loadingSuppliers ? '...' : suppliers.length}개 매입처 등록</p>
          </div>
        </div>
      ) : loadingOrders ? (
        <div className="card">
          <div className="text-center py-16 text-slate-400">로딩 중...</div>
        </div>
      ) : (
        <div className="table-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">{selectedName} - 발주 목록</h3>
            <span className="text-xs text-slate-400">{orders.length}건</span>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>발주일</th>
                  <th>상품명</th>
                  <th>SKU</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">단가</th>
                  <th className="text-right">금액</th>
                  <th className="text-center">상태</th>
                  <th>예상입고</th>
                  <th>입고일</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const st = STATUS_LABELS[o.status] || STATUS_LABELS.pending;
                  return (
                    <tr key={o.id}>
                      <td className="text-xs text-slate-500 tabular-nums">{new Date(o.orderedAt).toLocaleDateString('ko-KR')}</td>
                      <td className="font-medium text-slate-900">{o.productName}</td>
                      <td className="text-xs text-slate-400 font-mono">{o.sku}</td>
                      <td className="text-right tabular-nums">{o.quantity}</td>
                      <td className="text-right tabular-nums">{formatKRW(o.unitCost)}</td>
                      <td className="text-right tabular-nums font-semibold">{formatKRW(o.totalCost)}원</td>
                      <td className="text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs ${st.bg} ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400 tabular-nums">{o.expectedAt ? new Date(o.expectedAt).toLocaleDateString('ko-KR') : '-'}</td>
                      <td className="text-xs text-slate-400 tabular-nums">{o.receivedAt ? new Date(o.receivedAt).toLocaleDateString('ko-KR') : '-'}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400 text-sm">해당 매입처의 발주 데이터가 없습니다.</td></tr>
                )}
              </tbody>
              {orders.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3}>합계</td>
                    <td className="text-right tabular-nums">{formatNumber(totalQty)}</td>
                    <td></td>
                    <td className="text-right tabular-nums">{formatKRW(totalAmount)}원</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
