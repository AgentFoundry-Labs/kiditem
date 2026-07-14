'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, Package, ChevronDown, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';
import { fetchSupplierProductSalesReport } from '../lib/supplier-stats-api';

interface Supplier {
  id: string;
  name: string;
}

export default function SupplierProductSales() {
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'list'],
    queryFn: () => apiClient.get<Supplier[]>('/api/suppliers'),
  });

  const [selectedId, setSelectedId] = useState<string>('');

  const { data: productReport, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['supplier-stats', 'productSales', selectedId],
    queryFn: () => fetchSupplierProductSalesReport(selectedId),
    enabled: !!selectedId,
    placeholderData: (previousData) => previousData,
  });

  const products = productReport?.items ?? [];
  const summary = productReport?.summary ?? {
    productCount: 0,
    totalOrders: 0,
    totalQuantity: 0,
    totalRevenue: 0,
  };
  const showInitialLoading = isLoading && !productReport;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
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
          <div className="card">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1"><Package size={14} />상품 수</div>
            <div className="card-value">{showInitialLoading ? '-' : `${summary.productCount}개`}</div>
          </div>
          <div className="card">
            <div className="card-label mb-1">총 매출</div>
            <div className="card-value text-purple-600">{showInitialLoading ? '-' : `${formatKRW(summary.totalRevenue)}원`}</div>
          </div>
          <div className="card">
            <div className="card-label mb-1">총 판매수량</div>
            <div className="card-value text-slate-800">{showInitialLoading ? '-' : `${summary.totalQuantity}개`}</div>
          </div>
          <div className="card">
            <div className="card-label mb-1">총 주문수</div>
            <div className="card-value">{showInitialLoading ? '-' : `${summary.totalOrders}건`}</div>
          </div>
        </div>
      )}

      {isPlaceholderData && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin text-purple-600" />
          선택한 매입처의 상품별 판매 데이터를 갱신하는 중입니다.
        </div>
      )}

      {/* 상품별 테이블 */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{suppliers.find((s) => s.id === selectedId)?.name || '매입처'} 상품 판매현황</h3>
          <span className="text-xs text-slate-400">{products.length}개 상품</span>
        </div>
        {!selectedId ? (
          <div className="empty-state">매입처를 선택해주세요.</div>
        ) : showInitialLoading ? (
          <div className="empty-state">상품 판매 데이터를 불러오는 중...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">해당 매입처의 상품 판매 데이터가 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>상품명</th>
                <th className="text-right">공급가</th>
                <th className="text-right">매출</th>
                <th className="text-right">주문건</th>
                <th className="text-right">수량</th>
              </tr>
            </thead>
            <tbody >
              {products.map((p) => (
                  <tr key={p.masterId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">{p.masterName}{p.optionName ? ` / ${p.optionName}` : ''}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.supplyPrice == null ? '-' : formatKRW(p.supplyPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(p.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalOrders}건</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalQuantity}개</td>
                  </tr>
              ))}
              {/* 합계 */}
              <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                <td className="px-4 py-3 text-slate-900" colSpan={2}>합계</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatKRW(summary.totalRevenue)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{summary.totalOrders}건</td>
                <td className="px-4 py-3 text-right tabular-nums">{summary.totalQuantity}개</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
