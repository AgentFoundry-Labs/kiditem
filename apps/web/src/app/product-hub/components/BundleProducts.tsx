'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers, Plus, Trash2, Package, DollarSign,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW } from '@/lib/utils';

/* --- Types --- */
interface BundleItem {
  productId: string;
  quantity: number;
  product: { name: string; costPrice: number; sellPrice: number } | null;
}
interface BundleProduct {
  id: string;
  name: string;
  sku: string | null;
  sellPrice: number;
  items: BundleItem[];
  totalItemCost: number;
  profit: number;
  marginRate: number;
}

export default function BundleProducts() {
  const queryClient = useQueryClient();

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: [...queryKeys.bundleProducts.all, 'analyze'],
    queryFn: () => apiClient.get<BundleProduct[]>('/api/bundle-products/analyze'),
  });

  const summary = useMemo(() => {
    const totalBundles = bundles.length;
    const totalProfit = bundles.reduce((s, b) => s + b.profit, 0);
    const avgMargin = totalBundles > 0 ? Math.round(bundles.reduce((s, b) => s + b.marginRate, 0) / totalBundles) : 0;
    const unprofitable = bundles.filter(b => b.profit < 0).length;
    return { totalBundles, totalProfit, avgMargin, unprofitable };
  }, [bundles]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 생성 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', sellPrice: 0 });
  const [products] = useState<{ id: string; name: string; costPrice: number }[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ productId: string; quantity: number }[]>([]);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; sku: string; sellPrice: number; items: { productId: string; quantity: number }[] }) =>
      apiClient.post('/api/bundle-products', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bundleProducts.all });
      setShowForm(false);
      setForm({ name: '', sku: '', sellPrice: 0 });
      setSelectedItems([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/bundle-products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bundleProducts.all }),
  });

  const syncing = createMutation.isPending;

  if (isLoading) return <div className="text-center py-12 text-slate-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Layers size={22} className="text-purple-500" /> 묶음 상품 AI 분석
        </h1>
        <div className="flex items-center gap-2">
          <button disabled={syncing}
            className="px-3 py-1.5 text-[13px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> 원가 동기화
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-[13px] bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-1.5">
            <Plus size={13} /> 묶음 만들기
          </button>
        </div>
      </div>

      {/* 요약 */}
      <div className="card p-5">
        <h2 className="text-[15px] font-bold text-slate-900 mb-3">묶음 상품 요약</h2>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[10px] text-slate-400">총 묶음</div>
            <div className="text-[17px] font-bold text-slate-900">{summary.totalBundles}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[10px] text-slate-400">총 이익</div>
            <div className={`text-[17px] font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(summary.totalProfit)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[10px] text-slate-400">평균 마진</div>
            <div className="text-[17px] font-bold">{summary.avgMargin}%</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-[10px] text-red-500">적자 묶음</div>
            <div className="text-[17px] font-bold text-red-700">{summary.unprofitable}</div>
          </div>
        </div>
      </div>

      {/* 생성 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl p-5 border border-purple-200 space-y-4">
          <h3 className="font-semibold text-slate-900 text-[14px]">새 묶음 상품</h3>
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="묶음 이름 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg text-[13px]" />
            <input placeholder="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className="px-3 py-2 border rounded-lg text-[13px]" />
            <input placeholder="판매가" type="number" value={form.sellPrice || ''} onChange={e => setForm({ ...form, sellPrice: Number(e.target.value) })} className="px-3 py-2 border rounded-lg text-[13px]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-700">구성품</span>
              <button onClick={() => setSelectedItems([...selectedItems, { productId: '', quantity: 1 }])} className="text-[12px] text-purple-600 hover:underline">+ 추가</button>
            </div>
            {selectedItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={item.productId} onChange={e => { const n = [...selectedItems]; n[i].productId = e.target.value; setSelectedItems(n); }} className="flex-1 px-3 py-2 border rounded-lg text-[13px]">
                  <option value="">상품 선택</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({formatKRW(p.costPrice)})</option>)}
                </select>
                <input type="number" min={1} value={item.quantity} onChange={e => { const n = [...selectedItems]; n[i].quantity = Number(e.target.value); setSelectedItems(n); }} className="w-20 px-3 py-2 border rounded-lg text-[13px]" />
                <button onClick={() => setSelectedItems(selectedItems.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button
            onClick={() => createMutation.mutate({ name: form.name, sku: form.sku, sellPrice: form.sellPrice, items: selectedItems })}
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-[13px] font-medium hover:bg-purple-700 disabled:opacity-50">등록</button>
        </div>
      )}

      {/* 묶음별 카드 */}
      <div className="space-y-2">
        {bundles.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">묶음 상품이 없습니다.</div>
        ) : bundles.map((b) => {
          const isExpanded = expandedId === b.id;

          return (
            <div key={b.id} className={`bg-white rounded-xl border ${isExpanded ? 'border-purple-200' : 'border-slate-200'} overflow-hidden transition-all`}>
              {/* 요약 행 */}
              <button onClick={() => setExpandedId(isExpanded ? null : b.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-slate-900 truncate">{b.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b.profit >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {b.profit >= 0 ? '수익' : '적자'}
                    </span>
                  </div>
                  {b.sku && <span className="text-[11px] text-slate-400 font-mono">{b.sku}</span>}
                </div>
                <div className="flex items-center gap-5 shrink-0 text-[13px]">
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">판매가</div>
                    <div className="font-semibold">{formatKRW(b.sellPrice)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">원가</div>
                    <div className="font-semibold">{formatKRW(b.totalItemCost)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">마진</div>
                    <div className={`font-semibold ${b.marginRate < 0 ? 'text-red-600' : b.marginRate < 10 ? 'text-amber-600' : 'text-green-600'}`}>{b.marginRate}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">이익</div>
                    <div className={`font-semibold ${b.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(b.profit)}</div>
                  </div>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* 펼침: 구성품 원가 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  <div className="pt-4">
                    <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                      <Package size={13} /> 구성품 원가
                    </h3>
                    <div className="space-y-1.5">
                      {b.items.map((item, i) => (
                        <div key={i} className="bg-slate-50 rounded-lg p-2 flex items-center justify-between text-[12px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-700 truncate max-w-[200px]">{item.product?.name ?? '-'}</span>
                            <span className="text-slate-400">x{item.quantity}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">{formatKRW((item.product?.costPrice ?? 0) * item.quantity)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between mt-3 text-[12px] border-t pt-2">
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={13} className="text-slate-500" />
                        <span className="text-slate-500">판매가</span>
                        <span className="font-semibold text-purple-700">{formatKRW(b.sellPrice)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">원가합</span>
                        <span className="font-semibold ml-1">{formatKRW(b.totalItemCost)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteMutation.mutate(b.id)}
                      disabled={deleteMutation.isPending}
                      className="mt-3 w-full text-center text-[12px] text-red-400 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                      <Trash2 size={12} /> 묶음 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
