'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, RefreshCw, CheckCircle, Loader2, Building2, Package, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface StockTransfer {
  id: string;
  productId: string;
  quantity: number;
  status: string;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string } | null;
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
}

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

const statusConfig: Record<string, { text: string; color: string }> = {
  pending: { text: '대기', color: 'bg-slate-100 text-slate-700' },
  in_transit: { text: '이관중', color: 'bg-blue-100 text-blue-700' },
  completed: { text: '완료', color: 'bg-green-100 text-green-700' },
  cancelled: { text: '취소', color: 'bg-red-100 text-red-700' },
};

export default function StockTransfers() {
  const queryClient = useQueryClient();

  const { data: transfers = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.stockTransfers.all,
    queryFn: () => apiClient.get<StockTransfer[]>('/api/stock-transfers'),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.warehouses.all,
    queryFn: () => apiClient.get<Warehouse[]>('/api/warehouses'),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => apiClient.get<{ items: Product[] }>('/api/products?limit=200'),
  });
  const products = productsData?.items ?? [];

  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: 1,
    note: '',
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiClient.post('/api/stock-transfers', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      setShowModal(false);
      setForm({ productId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 1, note: '' });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/stock-transfers/${id}`, { status: 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-transfers'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/stock-transfers/${id}`, { status: 'cancelled' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-transfers'] }),
  });

  const processing = completeMutation.isPending || cancelMutation.isPending ? (completeMutation.variables || cancelMutation.variables || null) : null;

  const filtered =
    filter === 'all'
      ? transfers
      : transfers.filter((t) => t.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          <ArrowRightLeft size={20} className="inline mr-2" />
          창고 간 재고 이관
        </h2>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus size={16} />
            이관 요청
          </button>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-2 items-center">
        <Filter size={14} className="text-slate-400" />
        {[
          { key: 'all', label: '전체' },
          { key: 'pending', label: '대기' },
          { key: 'in_transit', label: '이관중' },
          { key: 'completed', label: '완료' },
          { key: 'cancelled', label: '취소' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                ({transfers.filter((t) => t.status === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 이관 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> 로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <ArrowRightLeft size={48} className="mx-auto mb-3 opacity-30" />
          <p>이관 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {t.id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          statusConfig[t.status]?.color || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {statusConfig[t.status]?.text || t.status}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-800">{t.product?.name ?? '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-xs text-slate-400">출발</div>
                      <div className="flex items-center gap-1 font-medium text-slate-700">
                        <Building2 size={12} />
                        {t.fromWarehouse?.name ?? '-'}
                      </div>
                    </div>
                    <ArrowRightLeft size={14} className="text-slate-300" />
                    <div className="text-center">
                      <div className="text-xs text-slate-400">도착</div>
                      <div className="flex items-center gap-1 font-medium text-slate-700">
                        <Building2 size={12} />
                        {t.toWarehouse?.name ?? '-'}
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400">수량</div>
                    <div className="flex items-center gap-1 font-bold text-slate-900">
                      <Package size={12} />
                      {t.quantity}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                  </div>
                  <div className="flex gap-1">
                    {(t.status === 'pending' || t.status === 'in_transit') && (
                      <button
                        disabled={processing === t.id}
                        onClick={() => completeMutation.mutate(t.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {processing === t.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        이관 완료
                      </button>
                    )}
                    {t.status === 'pending' && (
                      <button
                        disabled={processing === t.id}
                        onClick={() => cancelMutation.mutate(t.id)}
                        className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {t.notes && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded">
                  {t.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 이관 요청 모달 */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal-content max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <ArrowRightLeft size={18} />
              이관 요청 생성
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상품 선택</label>
                <select
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">상품을 선택하세요</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">출발 창고</label>
                  <select
                    value={form.fromWarehouseId}
                    onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">선택</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.code ? `(${w.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">도착 창고</label>
                  <select
                    value={form.toWarehouseId}
                    onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">선택</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.code ? `(${w.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">메모 (선택)</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="이관 사유 등"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                이관 요청
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
