'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw,
  Plus,
  RefreshCw,
  Filter,
  Loader2,
  PackageCheck,
  Trash2,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

interface ReturnTransfer {
  id: string;
  rtNumber: string | null;
  orderId: string | null;
  productId: string | null;
  productName: string;
  quantity: number;
  status: string;
  condition: string | null;
  restockedQty: number;
  disposedQty: number;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string } | null;
}

interface Order {
  id: string;
  orderNumber: string;
  productName: string;
}

const statusConfig: Record<string, { text: string; color: string }> = {
  received: { text: '접수', color: 'bg-blue-100 text-blue-700' },
  inspecting: { text: '검수중', color: 'bg-yellow-100 text-yellow-700' },
  restocked: { text: '재입고', color: 'bg-green-100 text-green-700' },
  disposed: { text: '폐기', color: 'bg-red-100 text-red-700' },
};

const conditionConfig: Record<string, { text: string; color: string }> = {
  good: { text: '양호', color: 'bg-green-100 text-green-700' },
  damaged: { text: '파손', color: 'bg-orange-100 text-orange-700' },
  defective: { text: '불량', color: 'bg-red-100 text-red-700' },
};

export default function ReturnTransfers() {
  const queryClient = useQueryClient();

  const { data: transfers = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.returnTransfers.all,
    queryFn: () => apiClient.get<ReturnTransfer[]>('/api/return-transfers'),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'list'],
    queryFn: () => apiClient.get<{ items: Order[] }>('/api/orders'),
  });
  const orders = ordersData?.items ?? [];

  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<ReturnTransfer | null>(null);
  const [form, setForm] = useState({
    orderId: '',
    productName: '',
    quantity: 1,
    note: '',
  });
  const [inspectForm, setInspectForm] = useState({
    condition: 'good' as string,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiClient.post('/api/return-transfers', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return-transfers'] });
      setShowModal(false);
      setForm({ orderId: '', productName: '', quantity: 1, note: '' });
    },
  });

  const inspectMutation = useMutation({
    mutationFn: ({ id, condition }: { id: string; condition: string }) =>
      apiClient.patch(`/api/return-transfers/${id}`, { status: 'inspecting', condition }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return-transfers'] });
      setSelected(null);
    },
  });

  const restockMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/return-transfers/${id}`, { status: 'restocked' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['return-transfers'] }),
  });

  const disposeMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/return-transfers/${id}`, { status: 'disposed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['return-transfers'] }),
  });

  const processing = restockMutation.isPending || disposeMutation.isPending || inspectMutation.isPending
    ? (restockMutation.variables || disposeMutation.variables || inspectMutation.variables?.id || null)
    : null;

  const filtered =
    filter === 'all'
      ? transfers
      : transfers.filter((t) => t.status === filter);

  const counts = {
    received: transfers.filter((t) => t.status === 'received').length,
    inspecting: transfers.filter((t) => t.status === 'inspecting').length,
    restocked: transfers.filter((t) => t.status === 'restocked').length,
    disposed: transfers.filter((t) => t.status === 'disposed').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          <RotateCcw size={20} className="inline mr-2" />
          R/T (반품 → 재입고)
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
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
          >
            <Plus size={16} />
            R/T 접수
          </button>
        </div>
      </div>

      {/* 요약 KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <PackageCheck size={20} className="text-purple-600" />
            <div>
              <div className="card-label mb-1">접수</div>
              <div className="card-value text-purple-600">{counts.received}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <Search size={20} className="text-yellow-600" />
            <div>
              <div className="card-label mb-1">검수중</div>
              <div className="card-value text-yellow-600">{counts.inspecting}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <div className="card-label mb-1">재입고</div>
              <div className="card-value text-green-600">{counts.restocked}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <Trash2 size={20} className="text-red-600" />
            <div>
              <div className="card-label mb-1">폐기</div>
              <div className="card-value text-red-600">{counts.disposed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-2 items-center">
        <Filter size={14} className="text-slate-400" />
        {[
          { key: 'all', label: '전체' },
          { key: 'received', label: '접수' },
          { key: 'inspecting', label: '검수중' },
          { key: 'restocked', label: '재입고' },
          { key: 'disposed', label: '폐기' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', filter === f.key ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                ({counts[f.key as keyof typeof counts] || 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* R/T 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> 로딩 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <RotateCcw size={48} className="mx-auto mb-3 opacity-30" />
          <p>R/T 내역이 없습니다</p>
        </div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>R/T 번호</th>
                <th>주문번호</th>
                <th>상품명</th>
                <th className="text-right">수량</th>
                <th>상태</th>
                <th>상태(품질)</th>
                <th>접수일</th>
                <th className="text-center">액션</th>
              </tr>
            </thead>
            <tbody >
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                    {t.rtNumber || t.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {t.orderId || '-'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[180px] truncate">
                    {t.productName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.quantity}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusConfig[t.status]?.color || 'bg-slate-100 text-slate-600')}
                    >
                      {statusConfig[t.status]?.text || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.condition ? (
                      <span
                        className={cn('text-xs px-2 py-0.5 rounded-full font-medium', conditionConfig[t.condition]?.color || 'bg-slate-100')}
                      >
                        {conditionConfig[t.condition]?.text || t.condition}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-center">
                      {t.status === 'received' && (
                        <button
                          onClick={() => {
                            setSelected(t);
                            setInspectForm({ condition: 'good' });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600"
                        >
                          <Eye size={12} />
                          검수
                        </button>
                      )}
                      {t.status === 'inspecting' && t.condition === 'good' && (
                        <button
                          disabled={processing === t.id}
                          onClick={() => restockMutation.mutate(t.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {processing === t.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <PackageCheck size={12} />
                          )}
                          재입고
                        </button>
                      )}
                      {t.status === 'inspecting' &&
                        (t.condition === 'damaged' || t.condition === 'defective') && (
                          <button
                            disabled={processing === t.id}
                            onClick={() => disposeMutation.mutate(t.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {processing === t.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            폐기
                          </button>
                        )}
                      {t.status === 'inspecting' && !t.condition && (
                        <button
                          onClick={() => {
                            setSelected(t);
                            setInspectForm({ condition: 'good' });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600"
                        >
                          <Eye size={12} />
                          검수
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* R/T 접수 모달 */}
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
              <RotateCcw size={18} />
              R/T 접수
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  주문 선택 (선택)
                </label>
                <select
                  value={form.orderId}
                  onChange={(e) => {
                    const oid = e.target.value;
                    setForm({ ...form, orderId: oid });
                    const order = orders.find((o) => o.id === oid);
                    if (order) setForm((f) => ({ ...f, orderId: oid, productName: order.productName }));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">직접 입력</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} - {o.productName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상품명</label>
                <input
                  value={form.productName}
                  onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  placeholder="반품 상품명"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
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
                  placeholder="반품 사유 등"
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
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                접수
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 검수 모달 */}
      {selected && (
        <div
          className="modal-overlay"
          onClick={() => setSelected(null)}
        >
          <div
            className="modal-content max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Eye size={18} />
              검수 — {selected.productName}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              수량: {selected.quantity}개 | R/T: {selected.rtNumber || selected.id.slice(0, 8)}
            </p>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                상품 상태 선택
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'good', label: '양호', icon: CheckCircle, color: 'green' },
                  { key: 'damaged', label: '파손', icon: AlertTriangle, color: 'orange' },
                  { key: 'defective', label: '불량', icon: XCircle, color: 'red' },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const isActive = inspectForm.condition === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setInspectForm({ condition: opt.key })}
                      className={cn('p-4 rounded-xl border-2 text-center transition-all', isActive ? (opt.color === 'green' ? 'border-green-500 bg-green-50' : opt.color === 'orange' ? 'border-orange-500 bg-orange-50' : 'border-red-500 bg-red-50') : 'border-slate-200 hover:border-slate-300')}
                    >
                      <Icon
                        size={24}
                        className={cn('mx-auto mb-2', opt.color === 'green' ? 'text-green-600' : opt.color === 'orange' ? 'text-orange-600' : 'text-red-600')}
                      />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
              >
                취소
              </button>
              <button
                disabled={inspectMutation.isPending}
                onClick={() => inspectMutation.mutate({ id: selected.id, condition: inspectForm.condition })}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
              >
                {inspectMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Eye size={14} />
                )}
                검수 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
