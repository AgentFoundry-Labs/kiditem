'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingDown, Package, Percent, Loader2, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

interface PurchaseOrder {
  id: string;
  status: string;
  items?: { productId: string; productName: string; quantity: number }[];
}

interface InventoryItem {
  productId: string;
  currentStock: number;
  product?: { id: string; name: string; sku: string | null; grade?: string | null } | null;
}

interface RetentionItem {
  productId: string;
  productName: string;
  sku: string | null;
  grade: string;
  totalInbound: number;
  currentStock: number;
  retentionRate: number;
  soldQuantity: number;
}

export default function StockRetention() {
  const { data: poData, isLoading: loadingPo } = useQuery({
    queryKey: queryKeys.purchaseOrders.list({ status: 'received' }),
    queryFn: () =>
      apiClient.get<{ items: PurchaseOrder[]; total: number }>(
        '/api/purchase-orders?status=received&limit=200'
      ),
  });

  const { data: invData, isLoading: loadingInv } = useQuery({
    queryKey: queryKeys.inventory.list({ limit: '500' }),
    queryFn: () =>
      apiClient.get<{ items: InventoryItem[]; total: number }>('/api/inventory?limit=200'),
  });

  const isLoading = loadingPo || loadingInv;

  const items = useMemo(() => {
    const orders = poData?.items ?? [];
    const inventories = invData?.items ?? [];

    // 상품별 총 입고 수량 계산
    const inboundMap = new Map<string, { name: string; qty: number }>();
    for (const po of orders) {
      for (const item of po.items ?? []) {
        const qty = Number(item.quantity) || 0;
        const prev = inboundMap.get(item.productId) ?? { name: item.productName, qty: 0 };
        prev.qty += qty;
        inboundMap.set(item.productId, prev);
      }
    }

    // 재고 맵
    const stockMap = new Map<string, InventoryItem>();
    for (const inv of inventories) {
      stockMap.set(inv.productId, inv);
    }

    // 잔존율 계산
    const result: RetentionItem[] = [];
    for (const [productId, inbound] of Array.from(inboundMap.entries())) {
      const inv = stockMap.get(productId);
      const currentStock = Number(inv?.currentStock) || 0;
      const totalInbound = inbound.qty;
      const soldQuantity = Math.max(0, totalInbound - currentStock);
      const retentionRate = totalInbound > 0 ? (currentStock / totalInbound) * 100 : 0;

      result.push({
        productId,
        productName: inbound.name || inv?.product?.name || productId,
        sku: inv?.product?.sku ?? null,
        grade: (inv?.product as any)?.grade ?? '-',
        totalInbound,
        currentStock,
        retentionRate: Math.round(retentionRate * 10) / 10,
        soldQuantity,
      });
    }

    return result.sort((a, b) => b.retentionRate - a.retentionRate);
  }, [poData, invData]);

  const totalInbound = items.reduce((s, i) => s + i.totalInbound, 0);
  const totalCurrentStock = items.reduce((s, i) => s + i.currentStock, 0);
  const avgRetention = totalInbound > 0 ? ((totalCurrentStock / totalInbound) * 100).toFixed(1) : '0';
  const highRetention = items.filter((i) => i.retentionRate > 80).length;

  const gradeColors: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-red-100 text-red-700',
  };

  const getRetentionColor = (rate: number) => {
    if (rate > 80) return 'text-red-600';
    if (rate > 50) return 'text-orange-600';
    if (rate > 20) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-cyan-600" />
          <h2 className="text-lg font-bold text-slate-800">입고대비 잔존재고 분석</h2>
        </div>
        <button disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-slate-500">총 입고수량</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{isLoading ? '-' : `${formatNumber(totalInbound)}개`}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">현재 잔존재고</p>
          <p className="text-2xl font-bold text-slate-800">{isLoading ? '-' : `${formatNumber(totalCurrentStock)}개`}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-cyan-500" />
            <p className="text-sm text-slate-500">평균 잔존율</p>
          </div>
          <p className="text-2xl font-bold text-cyan-600">{isLoading ? '-' : `${avgRetention}%`}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <p className="text-sm text-slate-500">잔존율 80%+</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{isLoading ? '-' : `${highRetention}개`}</p>
          <p className="text-xs text-slate-400 mt-1">판매 부진 주의</p>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          상품별 잔존재고 분석
          <span className="text-sm text-slate-400 ml-2">({items.length}개 상품)</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-center py-2 px-3">등급</th>
                <th className="text-right py-2 px-3">총 입고</th>
                <th className="text-right py-2 px-3">판매수량</th>
                <th className="text-right py-2 px-3">현재재고</th>
                <th className="text-right py-2 px-3">잔존율</th>
                <th className="text-left py-2 px-3">잔존율 바</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />로딩 중...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400">데이터 없음 (입고된 발주 없음)</td></tr>
              ) : items.map((item) => (
                <tr key={item.productId} className={`border-b border-slate-100 hover:bg-slate-50 ${item.retentionRate > 80 ? 'bg-red-50/30' : ''}`}>
                  <td className="py-2 px-3 font-medium max-w-[180px] truncate">{item.productName}</td>
                  <td className="py-2 px-3 text-xs text-slate-500 font-mono">{item.sku || '-'}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeColors[item.grade] || 'bg-gray-100 text-gray-600'}`}>{item.grade}</span>
                  </td>
                  <td className="py-2 px-3 text-right">{formatNumber(item.totalInbound)}개</td>
                  <td className="py-2 px-3 text-right text-green-600">{formatNumber(item.soldQuantity)}개</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(item.currentStock)}개</td>
                  <td className={`py-2 px-3 text-right font-bold ${getRetentionColor(item.retentionRate)}`}>
                    {item.retentionRate}%
                  </td>
                  <td className="py-2 px-3 w-32">
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${item.retentionRate > 80 ? 'bg-red-400' : item.retentionRate > 50 ? 'bg-orange-400' : 'bg-green-400'}`}
                        style={{ width: `${Math.min(100, item.retentionRate)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
