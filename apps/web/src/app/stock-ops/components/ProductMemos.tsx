'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Plus, RefreshCw, CheckCircle, Loader2, MessageSquare, AlertTriangle, Truck, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

interface Memo {
  id: string;
  productId: string;
  content: string;
  memoType: string;
  isResolved: boolean;
  createdAt: string;
  author: string | null;
}

const memoTypeConfig: Record<string, { text: string; color: string; bg: string; icon: typeof MessageSquare }> = {
  general: { text: '일반', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', icon: MessageSquare },
  urgent: { text: '긴급', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: AlertTriangle },
  shipping: { text: '배송', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', icon: Truck },
  quality: { text: '품질', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', icon: ShieldCheck },
};

export default function ProductMemos() {
  const queryClient = useQueryClient();

  const { data: productsData } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => apiClient.get<{ items: Product[] }>('/api/products?limit=200'),
  });
  const products = productsData?.items ?? [];

  const [selectedProductId, setSelectedProductId] = useState('');
  const [form, setForm] = useState({ content: '', memoType: 'general' });

  const { data: memos = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.productMemos.list(selectedProductId),
    queryFn: () => apiClient.get<Memo[]>(`/api/product-memos?productId=${selectedProductId}`),
    enabled: !!selectedProductId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { productId: string; content: string; memoType: string }) =>
      apiClient.post('/api/product-memos', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-memos', selectedProductId] });
      setForm({ content: '', memoType: 'general' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isResolved }: { id: string; isResolved: boolean }) =>
      apiClient.patch(`/api/product-memos/${id}`, { isResolved }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-memos', selectedProductId] }),
  });

  const submitting = createMutation.isPending;
  const togglingId = toggleMutation.isPending ? (toggleMutation.variables?.id ?? null) : null;

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const unresolvedCount = memos.filter((m) => !m.isResolved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          <StickyNote size={20} className="inline mr-2" />
          상품별 메모/전달사항
        </h2>
        {selectedProductId && (
          <button
            className="flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        )}
      </div>

      {/* 상품 선택 */}
      <div className="card">
        <label className="block text-sm font-medium text-slate-700 mb-2">상품 선택</label>
        <select
          value={selectedProductId}
          onChange={(e) => handleSelectProduct(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">상품을 선택하세요</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.sku ? `(${p.sku})` : ''}
            </option>
          ))}
        </select>
        {selectedProduct && (
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="font-medium text-slate-900">{selectedProduct.name}</span>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500">
              메모 {memos.length}건 | 미해결 {unresolvedCount}건
            </span>
          </div>
        )}
      </div>

      {selectedProductId && (
        <>
          {/* 메모 작성 폼 */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1">
              <Plus size={14} />
              새 메모 작성
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                {Object.entries(memoTypeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setForm({ ...form, memoType: key })}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.memoType === key
                          ? `${config.bg} ${config.color} border-current`
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={12} />
                      {config.text}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="메모 내용을 입력하세요..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
              />
              <div className="flex justify-end">
                <button
                  disabled={submitting || !form.content.trim()}
                  onClick={() => createMutation.mutate({ productId: selectedProductId, content: form.content, memoType: form.memoType })}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  메모 등록
                </button>
              </div>
            </div>
          </div>

          {/* 메모 목록 */}
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500">
              <Loader2 size={20} className="animate-spin mr-2" /> 메모 로딩 중...
            </div>
          ) : memos.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">
              <StickyNote size={48} className="mx-auto mb-3 opacity-30" />
              <p>등록된 메모가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {memos.map((memo) => {
                const config = memoTypeConfig[memo.memoType] || memoTypeConfig.general;
                const Icon = config.icon;
                return (
                  <div
                    key={memo.id}
                    className={`card border-l-4 ${
                      memo.isResolved ? 'opacity-60' : ''
                    } ${
                      memo.memoType === 'urgent'
                        ? 'border-l-red-500'
                        : memo.memoType === 'shipping'
                        ? 'border-l-blue-500'
                        : memo.memoType === 'quality'
                        ? 'border-l-orange-500'
                        : 'border-l-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${config.bg} ${config.color}`}
                          >
                            <Icon size={10} />
                            {config.text}
                          </span>
                          {memo.isResolved && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle size={10} />
                              해결됨
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            {new Date(memo.createdAt).toLocaleString('ko-KR')}
                          </span>
                          {memo.author && (
                            <span className="text-xs text-slate-400">by {memo.author}</span>
                          )}
                        </div>
                        <p
                          className={`text-sm ${
                            memo.isResolved
                              ? 'text-slate-400 line-through'
                              : 'text-slate-800'
                          }`}
                        >
                          {memo.content}
                        </p>
                      </div>
                      <button
                        disabled={togglingId === memo.id}
                        onClick={() => toggleMutation.mutate({ id: memo.id, isResolved: !memo.isResolved })}
                        className={`ml-4 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          memo.isResolved
                            ? 'border border-slate-300 text-slate-500 hover:bg-slate-50'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        } disabled:opacity-50`}
                      >
                        {togglingId === memo.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        {memo.isResolved ? '미해결로' : '해결'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
