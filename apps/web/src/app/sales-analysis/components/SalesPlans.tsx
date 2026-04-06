'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Plus,
  Trash2,
  Loader2,
  Save,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW, formatNumber } from '@/lib/utils';

interface SalesPlan {
  id: string;
  period: string;
  targetRevenue: number;
  targetOrders: number;
  targetProfit: number;
  actualRevenue: number;
  actualOrders: number;
  actualProfit: number;
  notes: string | null;
}

export default function SalesPlans() {
  const queryClient = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ['sales-plans'],
    queryFn: () => apiClient.get<SalesPlan[]>('/api/sales-plans'),
  });

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<SalesPlan | null>(null);
  const [form, setForm] = useState({ period: '', targetRevenue: 0, targetOrders: 0, targetProfit: 0, notes: '' });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiClient.post('/api/sales-plans', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-plans'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      apiClient.patch(`/api/sales-plans/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-plans'] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/sales-plans/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-plans'] }),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/sales-plans/${id}/sync`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-plans'] }),
  });

  const syncing = syncMutation.isPending ? (syncMutation.variables ?? null) : null;

  const getAchievementRate = (actual: number, target: number) => {
    if (target === 0) return 0;
    return Math.round((actual / target) * 100);
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 100) return 'bg-green-500';
    if (rate >= 70) return 'bg-blue-500';
    if (rate >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const openNew = () => {
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setEditItem(null);
    setForm({ period: defaultPeriod, targetRevenue: 0, targetOrders: 0, targetProfit: 0, notes: '' });
    setShowForm(true);
  };

  const openEdit = (item: SalesPlan) => {
    setEditItem(item);
    setForm({
      period: item.period,
      targetRevenue: item.targetRevenue,
      targetOrders: item.targetOrders,
      targetProfit: item.targetProfit,
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.period) return;
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Target size={22} /> 사업계획
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={openNew} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700">
            <Plus size={12} /> 목표 추가
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-400">
          등록된 사업계획이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const revenueRate = getAchievementRate(plan.actualRevenue, plan.targetRevenue);
            const ordersRate = getAchievementRate(plan.actualOrders, plan.targetOrders);
            const profitRate = getAchievementRate(plan.actualProfit, plan.targetProfit);

            return (
              <div key={plan.id} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900 font-mono">{plan.period}</span>
                    {plan.notes && <span className="text-xs text-slate-400">{plan.notes}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={syncing === plan.id}
                      onClick={() => syncMutation.mutate(plan.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50"
                    >
                      {syncing === plan.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <TrendingUp size={11} />
                      )}
                      실적 동기화
                    </button>
                    <button onClick={() => openEdit(plan)} className="p-1.5 text-slate-400 hover:text-blue-500">
                      <Save size={14} />
                    </button>
                    <button onClick={() => handleDelete(plan.id)} className="p-1.5 text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 매출 */}
                <div className="space-y-3">
                  <ProgressRow
                    label="매출"
                    target={formatKRW(plan.targetRevenue)}
                    actual={formatKRW(plan.actualRevenue)}
                    rate={revenueRate}
                    color={getProgressColor(revenueRate)}
                  />
                  <ProgressRow
                    label="주문수"
                    target={formatNumber(plan.targetOrders) + '건'}
                    actual={formatNumber(plan.actualOrders) + '건'}
                    rate={ordersRate}
                    color={getProgressColor(ordersRate)}
                  />
                  <ProgressRow
                    label="순이익"
                    target={formatKRW(plan.targetProfit)}
                    actual={formatKRW(plan.actualProfit)}
                    rate={profitRate}
                    color={getProgressColor(profitRate)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="section-title">
                {editItem ? '목표 수정' : '목표 추가'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">기간 (YYYY-MM)</label>
                <input
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono"
                  placeholder="2025-01"
                  disabled={!!editItem}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">목표 매출</label>
                  <input
                    type="number"
                    value={form.targetRevenue}
                    onChange={(e) => setForm({ ...form, targetRevenue: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">목표 주문수</label>
                  <input
                    type="number"
                    value={form.targetOrders}
                    onChange={(e) => setForm({ ...form, targetOrders: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">목표 순이익</label>
                  <input
                    type="number"
                    value={form.targetProfit}
                    onChange={(e) => setForm({ ...form, targetProfit: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">메모</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  placeholder="메모 (선택)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50">
                취소
              </button>
              <button onClick={handleSave} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressRow({ label, target, actual, rate, color }: {
  label: string;
  target: string;
  actual: string;
  rate: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-500 font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">목표: {target}</span>
          <span className="text-slate-700 font-semibold">실적: {actual}</span>
          <span className={`font-bold ${rate >= 100 ? 'text-green-600' : rate >= 70 ? 'text-blue-600' : 'text-red-600'}`}>
            <TrendingUp size={11} className="inline mr-0.5" />
            {rate}%
          </span>
        </div>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  );
}
