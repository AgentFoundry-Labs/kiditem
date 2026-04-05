'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, Package, ChevronDown } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface Supplier {
  id: string;
  name: string;
}

interface ProductSale {
  productId: string;
  productName: string;
  supplyPrice: number;
  totalOrders: number;
  totalQuantity: number;
  totalRevenue: number;
  revenue?: number;
  profit?: number;
  orderCount?: number;
}

export default function SupplierProductSales() {
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'list'],
    queryFn: () => apiClient.get<Supplier[]>('/api/suppliers'),
  });

  const [selectedId, setSelectedId] = useState<string>('');

  const { data: products = [] } = useQuery({
    queryKey: ['supplier-stats', 'productSales', selectedId],
    queryFn: () => apiClient.get<ProductSale[]>(`/api/supplier-stats?type=productSales&supplierId=${selectedId}`),
    enabled: !!selectedId,
  });

  const totalRevenue = products.reduce((s, p) => s + (p.totalRevenue ?? p.revenue ?? 0), 0);
  const totalProfit = products.reduce((s, p) => s + (p.profit ?? 0), 0);
  const totalOrders = products.reduce((s, p) => s + (p.totalOrders ?? p.orderCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <Store size={24} className="inline mr-2" />매입처-상품별 판매현황
        </h1>
        <div className="relative">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="appearance-none border rounded-lg pl-3 pr-8 py-2 text-sm bg-white"
          >
            <option value="">매입처 선택</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>
      </div>

      {/* 요약 카드 */}
      {selectedId && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Package size={14} />상품 수</div>
            <div className="text-xl font-bold text-slate-900">{products.length}개</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">총 매출</div>
            <div className="text-xl font-bold text-blue-600">{formatKRW(totalRevenue)}원</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">총 이익</div>
            <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(totalProfit)}원</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">총 주문수</div>
            <div className="text-xl font-bold text-slate-900">{totalOrders}건</div>
          </div>
        </div>
      )}

      {/* 상품별 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{suppliers.find((s) => s.id === selectedId)?.name || '매입처'} 상품 판매현황</h3>
          <span className="text-xs text-slate-400">{products.length}개 상품</span>
        </div>
        {!selectedId ? (
          <div className="text-center py-12 text-slate-400">매입처를 선택해주세요.</div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400">해당 매입처의 상품 판매 데이터가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">상품명</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">카테고리</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">공급가</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">매입원가</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">매출</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">이익</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">이익률</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">주문수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                  <tr key={p.productId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">{p.productName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatKRW(p.supplyPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(p.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalOrders}건</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalQuantity}개</td>
                  </tr>
              ))}
              {/* 합계 */}
              <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                <td className="px-4 py-3 text-slate-900" colSpan={5}>합계</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatKRW(totalRevenue)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatKRW(totalProfit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
                <td className="px-4 py-3 text-right tabular-nums">{totalOrders}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
