'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Link2, RefreshCw, Search } from 'lucide-react';
import type { OrderListItem, OrderListResponse } from '@kiditem/shared/order';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface OrderMatchingRow {
  id: string;
  displayOrderNumber: string;
  productName: string;
  optionName: string | null;
  sku: string | null;
  quantity: number;
}

function projectOrderLines(orders: OrderListItem[]): OrderMatchingRow[] {
  return orders.flatMap((order) => order.lineItems.map((lineItem) => ({
    id: lineItem.id,
    displayOrderNumber: order.displayOrderNumber,
    productName: lineItem.productName,
    optionName: lineItem.optionName,
    sku: lineItem.sku,
    quantity: lineItem.quantity,
  })));
}

function filterOrderLines(rows: OrderMatchingRow[], searchTerm: string): OrderMatchingRow[] {
  const normalized = searchTerm.trim().toLocaleLowerCase();
  if (!normalized) return rows;

  return rows.filter((row) => [
    row.displayOrderNumber,
    row.productName,
    row.optionName,
    row.sku,
  ].some((value) => value?.toLocaleLowerCase().includes(normalized)));
}

export default function OrderMatching() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.orders.list({}),
    queryFn: () => apiClient.get<OrderListResponse>('/api/orders'),
  });
  const orders = data?.items ?? [];
  const rows = projectOrderLines(orders);
  const filteredRows = filterOrderLines(rows, searchTerm);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="page-title">
            <Link2 size={24} className="mr-2 inline" />
            주문상품 매칭 확인
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            주문상품은 채널 옵션에 저장된 셀피아 상품 구성으로 처리됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw size={16} /> 새로고침
          </button>
          <Link
            href="/product-hub/matching"
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            <Link2 size={16} /> 채널 상품 매칭 관리
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-4 text-center">
            <div className="card-label">주문 건수</div>
            <div className="card-value">{isLoading ? '-' : `${orders.length}건`}</div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-4 text-center">
            <div className="card-label text-amber-600">매칭 확인 대상</div>
            <div className="card-value text-amber-700">{isLoading ? '-' : `${rows.length}건`}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle size={16} className="mr-2 inline" />
        이 화면에서는 매칭을 저장하지 않습니다. 채널 상품 매칭에서 옵션별 셀피아 상품과 차감 수량을 관리하세요.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="주문상품명, 옵션, SKU 또는 주문번호로 검색..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">로딩 중...</div>
      ) : filteredRows.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={48} className="mx-auto mb-3 opacity-30" />
          <p>확인할 주문상품이 없습니다</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <h3 className="font-semibold text-slate-700">주문상품 ({filteredRows.length}건)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">주문번호</th>
                  <th className="px-4 py-3">주문상품명</th>
                  <th className="px-4 py-3">옵션</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">수량</th>
                  <th className="px-4 py-3">처리 기준</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{row.displayOrderNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.productName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{row.optionName ?? '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{row.sku ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">{row.quantity}개</td>
                    <td className="px-4 py-3 text-xs text-amber-700">채널 옵션 구성 확인</td>
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
