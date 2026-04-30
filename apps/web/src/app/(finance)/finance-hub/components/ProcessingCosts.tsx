'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Factory,
  Plus,
  X,
  Clock,
  CheckCircle,
  Wallet,
  ArrowRight,
  Trash2,
  Calendar,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW } from '@/lib/utils';

interface ProcessingCost {
  id: string;
  productId: string | null;
  productName: string | null;
  vendor: string | null;
  processType: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
  date: string;
  status: string;
  notes: string | null;
}

interface MonthlySummary {
  month: string;
  total: number;
  pending: number;
  completed: number;
  paid: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending: { label: '미결', color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock },
  completed: { label: '완료', color: 'text-purple-600', bg: 'bg-purple-50', icon: CheckCircle },
  paid: { label: '지급완료', color: 'text-green-600', bg: 'bg-green-50', icon: Wallet },
};

export default function ProcessingCosts() {
  const queryClient = useQueryClient();

  const { data: costs = [] } = useQuery({
    queryKey: queryKeys.processingCosts.all,
    queryFn: () => apiClient.get<ProcessingCost[]>('/api/processing-costs'),
  });

  const { data: monthly = [] } = useQuery({
    queryKey: [...queryKeys.processingCosts.all, 'monthly'],
    queryFn: () => apiClient.get<MonthlySummary[]>('/api/processing-costs/monthly'),
  });

  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    productName: '',
    vendor: '',
    processType: '',
    unitCost: '',
    quantity: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const pendingTotal = costs.filter((c) => c.status === 'pending').reduce((s, c) => s + c.totalCost, 0);
  const completedTotal = costs.filter((c) => c.status === 'completed').reduce((s, c) => s + c.totalCost, 0);
  const paidTotal = costs.filter((c) => c.status === 'paid').reduce((s, c) => s + c.totalCost, 0);

  const createMutation = useMutation({
    mutationFn: (body: { productName: string; vendor: string; processType: string; unitCost: number; quantity: number; date: string; notes: string }) =>
      apiClient.post('/api/processing-costs', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.processingCosts.all });
      setShowModal(false);
      setForm({ productName: '', vendor: '', processType: '', unitCost: '', quantity: '', date: new Date().toISOString().slice(0, 10), notes: '' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.patch(`/api/processing-costs/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.processingCosts.all }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/processing-costs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.processingCosts.all }),
  });

  const handleCreate = () => {
    if (!form.processType || !form.unitCost || !form.quantity) return;
    createMutation.mutate({ ...form, unitCost: Number(form.unitCost), quantity: Number(form.quantity) });
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    statusMutation.mutate({ id, status: newStatus });
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <Factory size={24} className="inline mr-2" />임가공비 관리
        </h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700">
          <Plus size={14} /> 등록
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={12} className="text-yellow-500" />
            <span className="card-label">미결 합계</span>
          </div>
          <div className="card-value text-yellow-600 tabular-nums">{formatKRW(pendingTotal)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{costs.filter((c) => c.status === 'pending').length}건</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle size={12} className="text-blue-500" />
            <span className="card-label">완료 합계</span>
          </div>
          <div className="card-value text-purple-600 tabular-nums">{formatKRW(completedTotal)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{costs.filter((c) => c.status === 'completed').length}건</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-green-500" />
            <span className="card-label">지급완료 합계</span>
          </div>
          <div className="card-value text-green-600 tabular-nums">{formatKRW(paidTotal)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{costs.filter((c) => c.status === 'paid').length}건</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: '전체' },
          { key: 'pending', label: '미결' },
          { key: 'completed', label: '완료' },
          { key: 'paid', label: '지급완료' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === t.key ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="section-title">임가공비 목록</h3>
          <span className="text-xs text-slate-400">{costs.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>상품명</th>
                <th>업체</th>
                <th>공정</th>
                <th className="text-right">단가</th>
                <th className="text-right">수량</th>
                <th className="text-right">합계</th>
                <th className="text-center">상태</th>
                <th className="text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => {
                const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={c.id}>
                    <td className="text-slate-500 text-xs tabular-nums">{new Date(c.date).toLocaleDateString('ko-KR')}</td>
                    <td className="font-medium text-slate-900">{c.productName || '-'}</td>
                    <td className="text-slate-500 text-xs">{c.vendor || '-'}</td>
                    <td className="text-xs">{c.processType}</td>
                    <td className="text-right tabular-nums">{formatKRW(c.unitCost)}</td>
                    <td className="text-right tabular-nums">{c.quantity}</td>
                    <td className="text-right tabular-nums font-semibold">{formatKRW(c.totalCost)}원</td>
                    <td className="text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', cfg.bg, cfg.color)}>
                        <StatusIcon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {c.status === 'pending' && (
                          <button onClick={() => handleStatusChange(c.id, 'completed')} className="text-blue-500 hover:text-blue-700" title="완료처리">
                            <ArrowRight size={14} />
                          </button>
                        )}
                        {c.status === 'completed' && (
                          <button onClick={() => handleStatusChange(c.id, 'paid')} className="text-green-500 hover:text-green-700" title="지급처리">
                            <Wallet size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600" title="삭제">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {costs.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Summary */}
      {monthly.length > 0 && (
        <div className="table-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="section-title">월별 합계</h3>
            <Calendar size={14} className="text-slate-400" />
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>월</th>
                  <th className="text-right">미결</th>
                  <th className="text-right">완료</th>
                  <th className="text-right">지급완료</th>
                  <th className="text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="font-medium">{m.month}</td>
                    <td className="text-right tabular-nums text-yellow-600">{formatKRW(m.pending)}</td>
                    <td className="text-right tabular-nums text-purple-600">{formatKRW(m.completed)}</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(m.paid)}</td>
                    <td className="text-right tabular-nums font-semibold">{formatKRW(m.total)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">임가공비 등록</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">상품명</label>
                <input type="text" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="상품명" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">업체 (Vendor)</label>
                <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="임가공 업체명" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">공정유형 *</label>
                <input type="text" value={form.processType} onChange={(e) => setForm({ ...form, processType: e.target.value })} placeholder="예: 봉제, 인쇄, 조립..." className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">단가 *</label>
                  <input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">수량 *</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                </div>
              </div>
              {form.unitCost && form.quantity && (
                <div className="text-right text-sm font-semibold text-violet-600">
                  합계: {formatKRW(Number(form.unitCost) * Number(form.quantity))}원
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">날짜</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">메모</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={handleCreate} className="w-full py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
