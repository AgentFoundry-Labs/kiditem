'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface OrderItem {
  orderId: string;
  vendorItemName: string;
  vendorItemId?: string;
  quantity: number;
  orderPrice?: number;
  matched?: boolean;
  matchedProductId?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

export default function OrderMatching() {
  const [matchMap, setMatchMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: queryKeys.orders.list({}),
    queryFn: () =>
      apiClient.get<{ items: OrderItem[] }>('/api/orders'),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: queryKeys.products.list({}),
    queryFn: () =>
      apiClient.get<{ items: Product[]; total: number }>('/api/products'),
  });

  const isLoading = loadingOrders || loadingProducts;
  const orders = ordersData?.items ?? [];
  const products = productsData?.items ?? [];

  const handleMatch = (orderId: string, itemName: string) => {
    const productId = matchMap[`${orderId}-${itemName}`];
    if (!productId) return;

    setSaving(`${orderId}-${itemName}`);
    const product = products.find((p) => p.id === productId);
    setSuccessMsg(`"${itemName}" -> "${product?.name}" 매칭 완료`);

    setTimeout(() => setSuccessMsg(null), 3000);
    setSaving(null);
  };

  const unmatchedOrders = orders.filter((o) => !o.matched);
  const matchedOrders = orders.filter((o) => o.matched);

  const filteredUnmatched = searchTerm
    ? unmatchedOrders.filter(
        (o) =>
          o.vendorItemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.orderId.includes(searchTerm)
      )
    : unmatchedOrders;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <Link2 size={24} className="inline mr-2" />
          미매칭 주문상품 매칭
        </h1>
        <button className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 text-center">
            <div className="card-label">전체 주문상품</div>
            <div className="card-value">
              {isLoading ? '-' : `${orders.length}건`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 text-center">
            <div className="card-label text-red-500">미매칭</div>
            <div className="card-value text-red-600">
              {isLoading ? '-' : `${unmatchedOrders.length}건`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 text-center">
            <div className="card-label text-green-500">매칭완료</div>
            <div className="card-value text-green-600">
              {isLoading ? '-' : `${matchedOrders.length}건`}
            </div>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      {/* 검색 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="주문상품명 또는 주문번호로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* 미매칭 목록 */}
      {isLoading ? (
        <div className="empty-state">
          로딩 중...
        </div>
      ) : filteredUnmatched.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={48} className="mx-auto mb-3 opacity-30" />
          <p>미매칭 상품이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700">
              미매칭 주문상품 ({filteredUnmatched.length}건)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">주문번호</th>
                  <th className="px-4 py-3">주문상품명</th>
                  <th className="px-4 py-3">수량</th>
                  <th className="px-4 py-3 min-w-[250px]">매칭 상품 선택</th>
                  <th className="px-4 py-3">액션</th>
                </tr>
              </thead>
              <tbody >
                {filteredUnmatched.map((item, i) => {
                  const key = `${item.orderId}-${item.vendorItemName}`;
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">
                        {item.orderId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            size={14}
                            className="text-amber-500 flex-shrink-0"
                          />
                          <span className="text-sm font-medium">
                            {item.vendorItemName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{item.quantity}</td>
                      <td className="px-4 py-3">
                        <select
                          value={matchMap[key] || ''}
                          onChange={(e) =>
                            setMatchMap((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">-- 상품 선택 --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            handleMatch(item.orderId, item.vendorItemName)
                          }
                          disabled={!matchMap[key] || saving === key}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {saving === key ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Link2 size={12} />
                          )}
                          매칭
                        </button>
                      </td>
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
