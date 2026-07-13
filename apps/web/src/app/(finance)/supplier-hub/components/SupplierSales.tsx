'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, Package, DollarSign, Loader2 } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import {
  fetchSupplierProductSalesReport,
  fetchSupplierSalesReport,
} from '../lib/supplier-stats-api';

export default function SupplierSales() {
  const { data: salesReport } = useQuery({
    queryKey: ['supplier-stats', 'sales'],
    queryFn: fetchSupplierSalesReport,
  });

  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const { data: productReport, isLoading: loadingProducts, isPlaceholderData } = useQuery({
    queryKey: ['supplier-stats', 'productSales', selectedSupplier],
    queryFn: () => fetchSupplierProductSalesReport(selectedSupplier!),
    enabled: selectedSupplier != null,
    placeholderData: (previousData) => previousData,
  });

  const summary = salesReport?.summary ?? {
    supplierCount: 0,
    productCount: 0,
    totalOrders: 0,
    totalQuantity: 0,
    totalRevenue: 0,
    unallocatedRevenue: 0,
  };
  const suppliers = salesReport?.items ?? [];
  const products = productReport?.items ?? [];
  const selectedName = suppliers.find((s) => s.supplierId === selectedSupplier)?.supplierName;
  const showInitialProductLoading = loadingProducts && !productReport;

  return (
    <div className="space-y-6">
      <h1 className="page-title">
        <Store size={24} className="inline mr-2" />매입처별 판매현황
      </h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 card-label mb-1"><Store size={14} />매입처 수</div>
          <div className="card-value">{summary.supplierCount}개</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 card-label mb-1"><DollarSign size={14} className="text-purple-600" />총 매출</div>
          <div className="card-value text-purple-600">{formatKRW(summary.totalRevenue)}원</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 card-label mb-1"><Package size={14} className="text-green-500" />연결 상품</div>
          <div className="card-value text-slate-800">{summary.productCount}개</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 card-label mb-1"><Package size={14} />총 주문수</div>
          <div className="card-value">{summary.totalOrders}건</div>
        </div>
        <div className="card">
          <div className="card-label mb-1">미배분 매출</div>
          <div className="card-value text-amber-600">{formatKRW(summary.unallocatedRevenue)}원</div>
        </div>
      </div>

      {/* 매입처 테이블 */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">매입처별 매출/이익</h3>
        </div>
        {suppliers.length === 0 ? (
          <div className="empty-state">매입처 데이터가 없습니다. 매입처를 등록하고 상품을 연결하세요.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>매입처</th>
                <th>담당자</th>
                <th className="text-right">상품 수</th>
                <th className="text-right">매출</th>
                <th className="text-right">이익</th>
                <th className="text-right">이익률</th>
                <th className="text-right">주문수</th>
                <th className="text-center">상세</th>
              </tr>
            </thead>
            <tbody >
              {suppliers.map((sup) => (
                  <tr key={sup.supplierId} className={cn('hover:bg-slate-50 cursor-pointer', selectedSupplier === sup.supplierId && 'bg-purple-50')} onClick={() => setSelectedSupplier(sup.supplierId)}>
                  <td className="px-4 py-3 font-medium text-slate-900">{sup.supplierName}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">-</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sup.productCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(sup.totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">-</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">-</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sup.totalOrders}</td>
                  <td className="px-4 py-3 text-center">
                    <button className="text-xs text-purple-600 hover:underline">상품별</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 선택된 매입처의 상품별 상세 */}
      {selectedSupplier && (
        <div className="table-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">{selectedName} - 상품별 판매현황</h3>
            <button onClick={() => setSelectedSupplier(null)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
          </div>
          {isPlaceholderData && (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin text-purple-600" />
              상품별 판매 데이터를 갱신하는 중입니다.
            </div>
          )}
          {showInitialProductLoading ? (
            <div className="empty-state">상품별 판매 데이터를 불러오는 중...</div>
          ) : products.length === 0 ? (
            <div className="empty-state">해당 매입처의 판매 데이터가 없습니다.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>상품명</th>
                  <th>셀피아 상품코드</th>
                  <th className="text-right">공급가</th>
                  <th className="text-right">매출</th>
                  <th className="text-right">주문수</th>
                </tr>
              </thead>
              <tbody >
                {products.map((p) => (
                  <tr key={p.masterId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.masterName}{p.optionName ? ` / ${p.optionName}` : ''}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.masterCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.supplyPrice == null ? '-' : formatKRW(p.supplyPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatKRW(p.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalOrders}</td>
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
