'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers, Plus, Trash2, Package, DollarSign, AlertTriangle,
  CheckCircle, TrendingDown, ChevronDown, ArrowRight, Link2,
  RefreshCw, Zap, Ban, ShoppingCart,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

/* --- Types --- */
interface AnalysisItem {
  productId: string; productName: string; grade: string;
  costPrice: number; sellPrice: number; quantity: number; costContribution: number;
}
interface BundleAnalysis {
  bundleId: string; bundleName: string; sku: string | null;
  sellPrice: number; status: string;
  componentCost: number; bundleMargin: number; bundleProfit: number;
  items: AnalysisItem[];
  individualTotalPrice: number; bundleDiscount: number; individualMargin: number;
  linkedProductId: string | null;
  orderCount: number; revenue: number; netProfit: number; profitRate: number;
  verdict: 'profitable' | 'marginal' | 'unprofitable' | 'no_sales' | 'unlinked';
  issues: { severity: 'critical' | 'warning' | 'info'; message: string }[];
  recommendations: { priority: 'urgent' | 'high' | 'medium'; action: string; reason: string }[];
}
interface Summary {
  totalBundles: number; activeBundles: number; linkedBundles: number;
  avgMargin: number; unprofitable: number; noSales: number;
  totalRevenue: number; totalProfit: number; totalActions: number;
}

const VERDICT_CONFIG = {
  profitable: { label: '수익', bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-800', icon: CheckCircle, iconColor: 'text-green-500' },
  marginal: { label: '위험', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-500' },
  unprofitable: { label: '적자', bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800', icon: TrendingDown, iconColor: 'text-red-500' },
  no_sales: { label: '무판매', bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-100 text-slate-600', icon: Ban, iconColor: 'text-slate-400' },
  unlinked: { label: '미연결', bg: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: Link2, iconColor: 'text-purple-500' },
};
const GRADE_COLOR: Record<string, string> = { A: 'bg-blue-100 text-blue-800', B: 'bg-slate-100 text-slate-700', C: 'bg-gray-100 text-gray-500' };
const PRI_DOT: Record<string, string> = { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500' };

export default function BundleProducts() {
  const queryClient = useQueryClient();

  const { data: analyzeData, isLoading } = useQuery({
    queryKey: ['bundle-products', 'analyze'],
    queryFn: () => apiClient.get<{ summary: Summary; analyses: BundleAnalysis[] }>('/api/bundle-products/analyze'),
  });

  const summary = analyzeData?.summary ?? {
    totalBundles: 0, activeBundles: 0, linkedBundles: 0,
    avgMargin: 0, unprofitable: 0, noSales: 0,
    totalRevenue: 0, totalProfit: 0, totalActions: 0,
  };
  const analyses = analyzeData?.analyses ?? [];

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
      queryClient.invalidateQueries({ queryKey: ['bundle-products'] });
      setShowForm(false);
      setForm({ name: '', sku: '', sellPrice: 0 });
      setSelectedItems([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/bundle-products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bundle-products'] }),
  });

  const syncing = createMutation.isPending;

  if (isLoading) return <div className="text-center py-12 text-slate-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-slate-900 flex items-center gap-2">
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

      {/* AI 요약 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <Zap size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">묶음 AI 종합 진단</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">
              총 {summary.totalBundles}개 · 활성 {summary.activeBundles}개 · 연결 {summary.linkedBundles}개 · 평균 마진 {summary.avgMargin}%
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[10px] text-slate-400">총 매출</div>
            <div className="text-[17px] font-bold text-slate-900">{formatKRW(summary.totalRevenue)}</div>
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
          <div className="bg-amber-50 rounded-lg p-3">
            <div className="text-[10px] text-amber-500">조치 필요</div>
            <div className="text-[17px] font-bold text-amber-700">{summary.totalActions}</div>
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
        {analyses.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">묶음 상품이 없습니다.</div>
        ) : analyses.map((a) => {
          const cfg = VERDICT_CONFIG[a.verdict];
          const VIcon = cfg.icon;
          const isExpanded = expandedId === a.bundleId;

          return (
            <div key={a.bundleId} className={`bg-white rounded-xl border ${isExpanded ? cfg.bg.split(' ')[1] : 'border-slate-200'} overflow-hidden transition-all`}>
              {/* 요약 행 */}
              <button onClick={() => setExpandedId(isExpanded ? null : a.bundleId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/50 transition-colors">
                <VIcon size={16} className={`${cfg.iconColor} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-slate-900 truncate">{a.bundleName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.badge}`}>{cfg.label}</span>
                    {!a.linkedProductId && <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">미연결</span>}
                  </div>
                  {a.sku && <span className="text-[11px] text-slate-400 font-mono">{a.sku}</span>}
                </div>
                <div className="flex items-center gap-5 shrink-0 text-[13px]">
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">판매가</div>
                    <div className="font-semibold">{formatKRW(a.sellPrice)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">원가</div>
                    <div className="font-semibold">{formatKRW(a.componentCost)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">마진</div>
                    <div className={`font-semibold ${a.bundleMargin < 0 ? 'text-red-600' : a.bundleMargin < 10 ? 'text-amber-600' : 'text-green-600'}`}>{a.bundleMargin}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">주문</div>
                    <div className="font-semibold">{a.orderCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-[10px]">이슈</div>
                    <div className={`font-semibold ${a.issues.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{a.issues.length}</div>
                  </div>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* 펼침: 상세 분석 */}
              {isExpanded && (
                <div className={`px-4 pb-4 border-t ${cfg.bg}`}>
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    {/* 좌: 구성품 브레이크다운 */}
                    <div>
                      <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                        <Package size={13} /> 구성품 원가
                      </h3>
                      <div className="space-y-1.5">
                        {a.items.map((item, i) => (
                          <div key={i} className="bg-white/70 rounded-lg p-2 flex items-center justify-between text-[12px]">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${GRADE_COLOR[item.grade] || GRADE_COLOR.C}`}>{item.grade}</span>
                              <span className="text-slate-700 truncate max-w-[120px]">{item.productName}</span>
                              <span className="text-slate-400">x{item.quantity}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold">{formatKRW(item.costPrice * item.quantity)}</span>
                              <span className="text-slate-400 ml-1">({item.costContribution}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* 원가 기여도 바 */}
                      <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-gray-200">
                        {a.items.map((item, i) => (
                          <div key={i} className={`${i % 3 === 0 ? 'bg-blue-400' : i % 3 === 1 ? 'bg-purple-400' : 'bg-amber-400'}`}
                            style={{ width: `${item.costContribution}%` }} title={`${item.productName}: ${item.costContribution}%`} />
                        ))}
                      </div>
                    </div>

                    {/* 중: 개별 vs 묶음 비교 + 진단 */}
                    <div>
                      <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                        <DollarSign size={13} /> 개별 vs 묶음 비교
                      </h3>
                      <div className="bg-white/70 rounded-lg p-3 space-y-2 text-[12px] mb-3">
                        <div className="flex justify-between">
                          <span className="text-slate-500">개별 판매가 합</span>
                          <span className="font-semibold">{formatKRW(a.individualTotalPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">묶음 판매가</span>
                          <span className="font-semibold text-purple-700">{formatKRW(a.sellPrice)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="text-slate-500">묶음 할인율</span>
                          <span className={`font-semibold ${a.bundleDiscount > 20 ? 'text-red-600' : 'text-slate-900'}`}>{a.bundleDiscount}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">개별 마진 vs 묶음 마진</span>
                          <span className={`font-semibold ${a.bundleMargin < a.individualMargin ? 'text-red-600' : 'text-green-600'}`}>
                            {a.individualMargin}% → {a.bundleMargin}%
                          </span>
                        </div>
                      </div>

                      {/* 문제 진단 */}
                      <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                        <AlertTriangle size={13} /> 진단
                      </h3>
                      {a.issues.length === 0 ? (
                        <p className="text-[12px] text-green-600 flex items-center gap-1"><CheckCircle size={12} /> 문제 없음</p>
                      ) : a.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                          <span className="text-slate-700">{issue.message}</span>
                        </div>
                      ))}
                    </div>

                    {/* 우: 판매 실적 + 해결 방안 */}
                    <div>
                      <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                        <ShoppingCart size={13} /> 판매 실적
                      </h3>
                      <div className="grid grid-cols-2 gap-2 mb-3 text-[12px]">
                        <div className="bg-white/70 rounded-lg p-2">
                          <div className="text-slate-400 text-[10px]">주문</div>
                          <div className="font-semibold">{a.orderCount}건</div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2">
                          <div className="text-slate-400 text-[10px]">매출</div>
                          <div className="font-semibold">{formatKRW(a.revenue)}</div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2">
                          <div className="text-slate-400 text-[10px]">순이익</div>
                          <div className={`font-semibold ${a.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatKRW(a.netProfit)}</div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2">
                          <div className="text-slate-400 text-[10px]">이익률</div>
                          <div className={`font-semibold ${a.profitRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>{a.profitRate}%</div>
                        </div>
                      </div>

                      {a.recommendations.length > 0 && (
                        <>
                          <h3 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                            <ArrowRight size={13} /> 해결 방안
                          </h3>
                          {a.recommendations.map((rec, i) => (
                            <div key={i} className="bg-white/70 rounded-lg p-2 mb-1.5">
                              <div className="flex items-center gap-1.5 text-[12px]">
                                <span className={`w-2 h-2 rounded-full ${PRI_DOT[rec.priority] || 'bg-gray-400'}`} />
                                <span className="font-semibold text-slate-800">{rec.action}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 pl-3.5 mt-0.5">{rec.reason}</p>
                            </div>
                          ))}
                        </>
                      )}

                      <button
                        onClick={() => deleteMutation.mutate(a.bundleId)}
                        disabled={deleteMutation.isPending}
                        className="mt-3 w-full text-center text-[12px] text-red-400 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                        <Trash2 size={12} /> 묶음 삭제
                      </button>
                    </div>
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
