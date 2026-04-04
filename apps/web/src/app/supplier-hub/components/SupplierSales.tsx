'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, TrendingUp, Package, DollarSign } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface SupplierSale {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  productCount: number;
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  profitRate: number;
}

interface ProductSale {
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string;
  category: string;
  supplyPrice: number;
  revenue: number;
  profit: number;
  orderCount: number;
  costOfGoods: number;
}

export default function SupplierSales() {
  const { data: salesData } = useQuery({
    queryKey: ['supplier-stats', 'sales'],
    queryFn: () => apiClient.get<{ suppliers: SupplierSale[]; products: ProductSale[] }>('/api/supplier-stats?type=sales'),
  });

  const suppliers = salesData?.suppliers ?? [];
  const products = salesData?.products ?? [];
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const totalRevenue = suppliers.reduce((s, sup) => s + sup.totalRevenue, 0);
  const totalProfit = suppliers.reduce((s, sup) => s + sup.totalProfit, 0);
  const selectedName = suppliers.find((s) => s.id === selectedSupplier)?.name;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        <Store size={24} className="inline mr-2" />매입처별 판매현황
      </h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Store size={14} />매입처 수</div>
          <div className="text-xl font-bold text-slate-900">{suppliers.length}개</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><DollarSign size={14} className="text-blue-500" />총 매출</div>
          <div className="text-xl font-bold text-blue-600">{formatKRW(totalRevenue)}원</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><TrendingUp size={14} className="text-green-500" />총 이익</div>
          <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(totalProfit)}원</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Package size={14} />평균 이익률</div>
          <div className="text-xl font-bold text-slate-900">{totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0'}%</div>
        </div>
      </div>

      {/* 매입처 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">매입처별 매출/이익</h3>
        </div>
        {suppliers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">매입처 데이터가 없습니다. 매입처를 등록하고 상품을 연결하세요.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">매입처</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">담당자</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">상품 수</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">매출</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">이익</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">이익률</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">주문수</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((sup) => (
                <tr key={sup.id} className={`hover:bg-slate-50 cursor-pointer ${selectedSupplier === sup.id ? 'bg-blue-50' : ''}`} onClick={() => setSelectedSupplier(sup.id)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{sup.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{sup.contactName || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sup.productCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(sup.totalRevenue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${sup.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(sup.totalProfit)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${sup.profitRate >= 5 ? 'text-green-600' : 'text-orange-600'}`}>{sup.profitRate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sup.totalOrders}</td>
                  <td className="px-4 py-3 text-center">
                    <button className="text-xs text-blue-600 hover:underline">상품별</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 선택된 매입처의 상품별 상세 */}
      {selectedSupplier && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">{selectedName} - 상품별 판매현황</h3>
            <button onClick={() => setSelectedSupplier(null)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
          </div>
          {products.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">해당 매입처의 판매 데이터가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">상품명</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">카테고리</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">공급가</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">매출</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">이익</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">주문수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.productId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.productName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.sku}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatKRW(p.supplyPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(p.revenue)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(p.profit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
